"""
Render a recap PNG for every NEWS item this week *per account*,
upload them to S3, and fire notify_post once per account so Teams
gets a single card containing all thumbnails.
"""

import datetime
import io
import json
import logging
import os
import time
from typing import Any, Dict, List, Set

import boto3
from boto3.dynamodb.conditions import Key
from PIL import Image, ImageColor, ImageDraw, ImageFont

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ── Visual constants ─────────────────────────────────────────────────────────
WIDTH, HEIGHT        = 1080, 1350
BACKGROUND_COLOR     = (0, 0, 0)
GRADIENT_KEY         = "artifacts/Black Gradient.png"
LOGO_KEY             = "artifacts/Logo.png"

ROOT              = os.path.dirname(__file__)
FONT_PATH_TITLE   = os.path.join(ROOT, "ariblk.ttf")
FONT_PATH_DESC    = os.path.join(ROOT, "Montserrat-Medium.ttf")

TITLE_MAX, TITLE_MIN = 90, 60
DESC_MAX,  DESC_MIN  = 60, 30
HIGHLIGHT_COLOR      = "#ec008c"
BASE_COLOR           = "white"

# ── Runtime environment  ─────────────────────────────────────────────────────
TARGET_BUCKET  = os.environ["TARGET_BUCKET"]
NEWS_TABLE     = os.environ["NEWS_TABLE"]
NOTIFY_POST_ARN = os.environ["NOTIFY_POST_FUNCTION_ARN"]

dynamodb  = boto3.resource("dynamodb")
table     = dynamodb.Table(NEWS_TABLE)
s3        = boto3.client("s3")
lambda_cl = boto3.client("lambda")

# ── Text helpers (Pillow) ────────────────────────────────────────────────────
def measure(word: str, font_path: str, font_size: int) -> int:
    return ImageFont.truetype(font_path, font_size).getbbox(word)[2]

def autosize(text: str, max_size: int, min_size: int, ideal: int) -> int:
    if len(text) <= ideal:
        return max_size
    size = max_size - (len(text) - ideal) * (max_size - min_size) / ideal
    return max(int(size), min_size)

def multiline_colored(
    text: str,
    highlights: Set[str],
    font_path: str,
    font_size: int,
    max_width: int,
    space: int = 15,
    line_gap: int = 10,
) -> Image.Image:
    words = text.split()
    lines, cur_line, cur_w = [], [], 0
    for w in words:
        w_w = measure(w, font_path, font_size)
        add = w_w if not cur_line else w_w + space
        if cur_w + add <= max_width:
            cur_line.append(w); cur_w += add
        else:
            lines.append(cur_line); cur_line, cur_w = [w], w_w
    if cur_line: lines.append(cur_line)

    rendered_lines: List[Image.Image] = []
    for line in lines:
        x = 0
        pieces = []
        for w in line:
            color = HIGHLIGHT_COLOR if w.strip(",.!?;:").upper() in highlights else BASE_COLOR
            fnt   = ImageFont.truetype(font_path, font_size)
            w_w   = fnt.getbbox(w)[2]
            w_h   = fnt.getbbox(w)[3]
            img   = Image.new("RGBA", (w_w, w_h), (0, 0, 0, 0))
            ImageDraw.Draw(img).text((0, 0), w, font=fnt, fill=color)
            pieces.append((img, x))
            x += w_w + space
        line_img = Image.new("RGBA", (x - space, w_h), (0, 0, 0, 0))
        for img, xoff in pieces:
            line_img.paste(img, (xoff, 0), img)
        rendered_lines.append(line_img)

    total_h = sum(i.height for i in rendered_lines) + line_gap * (len(rendered_lines) - 1)
    canvas  = Image.new("RGBA", (max_width, total_h), (0, 0, 0, 0))
    y = 0
    for img in rendered_lines:
        canvas.paste(img, ((max_width - img.width) // 2, y), img)
        y += img.height + line_gap
    return canvas

# ── S3 helpers ───────────────────────────────────────────────────────────────
def dl(key: str, dest: str) -> bool:
    try:
        s3.download_file(TARGET_BUCKET, key, dest)
        return True
    except Exception as exc:
        logger.warning("Download %s failed: %s", key, exc)
        return False

def fetch_gradient() -> Image.Image | None:
    tmp = "/tmp/gradient.png"
    return Image.open(tmp).convert("RGBA").resize((WIDTH, HEIGHT)) if dl(GRADIENT_KEY, tmp) else None

def fetch_logo() -> Image.Image | None:
    tmp = "/tmp/logo.png"
    if not dl(LOGO_KEY, tmp): return None
    logo = Image.open(tmp).convert("RGBA")
    scale = 200 / logo.width
    return logo.resize((int(logo.width * scale), int(logo.height * scale)))

def fetch_background(bg_type: str, key: str) -> Image.Image | None:
    if not key or bg_type == "video": return None
    tmp = "/tmp/bg.jpg"
    return Image.open(tmp).convert("RGBA").resize((WIDTH, HEIGHT)) if dl(key, tmp) else None

# ── Rendering ────────────────────────────────────────────────────────────────
def render_item(item: Dict[str, Any]) -> Image.Image:
    bg  = fetch_background(item.get("backgroundType", "image"), item.get("s3Key", ""))
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), BACKGROUND_COLOR)
    if bg: canvas.paste(bg, (0, 0))

    if (grad := fetch_gradient()): canvas.alpha_composite(grad)

    title = item["title"].upper()
    sub   = (item.get("subtitle") or "").upper()

    hl_title = {w.strip().upper() for w in (item.get("highlightWordsTitle") or "").split(",") if w.strip()}
    hl_sub   = {w.strip().upper() for w in (item.get("highlightWordsDescription") or "").split(",") if w.strip()}

    title_font = autosize(title, TITLE_MAX, TITLE_MIN, 30)
    title_img  = multiline_colored(title, hl_title, FONT_PATH_TITLE, title_font, 1000)
    tx = (WIDTH - title_img.width) // 2
    canvas.alpha_composite(title_img, (tx, 275))

    if sub:
        desc_font = autosize(sub, DESC_MAX, DESC_MIN, 45)
        desc_img  = multiline_colored(sub, hl_sub, FONT_PATH_DESC, desc_font, 900)
        dx = (WIDTH - desc_img.width) // 2
        dy = HEIGHT - 300 - desc_img.height
        canvas.alpha_composite(desc_img, (dx, dy))

    if (logo := fetch_logo()):
        lx = WIDTH - logo.width - 50
        ly = HEIGHT - logo.height - 100
        line = Image.new("RGBA", (700, 4), ImageColor.getrgb(HIGHLIGHT_COLOR) + (255,))
        canvas.alpha_composite(line, (lx - 720, ly + logo.height // 2 - 2))
        canvas.alpha_composite(logo, (lx, ly))

    return canvas.convert("RGB")

# ── DynamoDB helpers ─────────────────────────────────────────────────────────
def list_accounts() -> Set[str]:
    """Return a distinct set of accountName values."""
    paginator = table.meta.client.get_paginator("scan")
    seen: Set[str] = set()
    for page in paginator.paginate(
        TableName=NEWS_TABLE,
        ProjectionExpression="accountName"
    ):
        for i in page.get("Items", []):
            seen.add(i["accountName"])
    return seen


def latest_items_for_account(account: str, limit: int = 4) -> List[Dict[str, Any]]:
    return table.query(
        KeyConditionExpression=Key("accountName").eq(account),
        ScanIndexForward=False,
        Limit=limit,
    )["Items"]

# ── Lambda entry‑point ───────────────────────────────────────────────────────
def lambda_handler(event: Dict[str, Any], _ctx: Any) -> Dict[str, Any]:
    logger.info("weekly_news_recap start")

    accounts = list_accounts()
    logger.info("Found %d account(s) with NEWS posts", len(accounts))

    summary: Dict[str, int] = {}

    for account in accounts:
        items = latest_items_for_account(account)
        if not items:
            continue

        image_keys: List[str] = []
        timestamp = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")

        for idx, item in enumerate(items):
            img   = render_item(item)
            key   = f"weekly_recap/{account}/recap_{timestamp}_{idx:03d}.png"
            buf   = io.BytesIO()
            img.save(buf, format="PNG", compress_level=3)
            buf.seek(0)
            s3.upload_fileobj(buf, TARGET_BUCKET, key, ExtraArgs={"ContentType": "image/png"})
            image_keys.append(key)
            logger.info("Uploaded %s", key)

        lambda_cl.invoke(
            FunctionName=NOTIFY_POST_ARN,
            InvocationType="Event",
            Payload=json.dumps({"accountName": account, "imageKeys": image_keys}).encode(),
        )
        summary[account] = len(image_keys)
        logger.info("Invoked notify_post for %s with %d thumbnail(s)", account, len(image_keys))

    return {"status": "complete", "accounts": summary}
