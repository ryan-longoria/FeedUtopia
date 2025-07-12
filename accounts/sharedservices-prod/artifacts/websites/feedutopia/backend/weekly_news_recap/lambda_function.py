"""
Render a recap PNG for every NEWS item this week *per account*,
upload them to S3, and invoke notify_post once per account so Teams
receives a single card that contains all thumbnails.
"""

import datetime
import io
import json
import logging
import os
from typing import Any, Dict, List, Set

import boto3
from boto3.dynamodb.conditions import Key
from PIL import Image, ImageColor, ImageDraw, ImageFont

# ── Logging ────────────────────────────────────────────────────────────────
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ── Visual constants ────────────────────────────────────────────────────────
WIDTH, HEIGHT          = 1080, 1350
BACKGROUND_COLOR       = (0, 0, 0)
GRADIENT_KEY           = "artifacts/Black Gradient.png"
LOGO_KEY               = "artifacts/Logo.png"

ROOT_DIR               = os.path.dirname(__file__)
FONT_PATH_TITLE        = os.path.join(ROOT_DIR, "ariblk.ttf")
FONT_PATH_DESC         = os.path.join(ROOT_DIR, "Montserrat-Medium.ttf")

TITLE_MAX, TITLE_MIN   = 90, 60
DESC_MAX,  DESC_MIN    = 60, 30
HIGHLIGHT_COLOR        = "#ec008c"
BASE_COLOR             = "white"

# ── Environment / clients ───────────────────────────────────────────────────
TARGET_BUCKET          = os.environ["TARGET_BUCKET"]
NEWS_TABLE             = os.environ["NEWS_TABLE"]
NOTIFY_POST_ARN        = os.environ["NOTIFY_POST_FUNCTION_ARN"]

dynamodb               = boto3.resource("dynamodb")
table                  = dynamodb.Table(NEWS_TABLE)
s3                     = boto3.client("s3")
lambda_cl              = boto3.client("lambda")

# ── Text helpers (Pillow) ───────────────────────────────────────────────────
def _measure(word: str, font_path: str, size: int) -> int:
    bbox = ImageFont.truetype(font_path, size).getbbox(word)
    return bbox[2] - bbox[0]

def _autosize(text: str, max_sz: int, min_sz: int, ideal: int) -> int:
    if len(text) <= ideal:
        return max_sz
    delta = (max_sz - min_sz) / ideal
    new_sz = max_sz - (len(text) - ideal) * delta
    return max(int(new_sz), min_sz)

def _multiline_colored(
    text: str,
    highlights: Set[str],
    font_path: str,
    size: int,
    max_width: int,
    space: int = 15,
    line_gap: int = 10,
) -> Image.Image:
    words = text.split()
    lines, cur, cur_w = [], [], 0
    for w in words:
        w_w = _measure(w, font_path, size)
        add = w_w if not cur else w_w + space
        if cur_w + add <= max_width:
            cur.append(w); cur_w += add
        else:
            lines.append(cur); cur, cur_w = [w], w_w
    if cur:
        lines.append(cur)

    rendered: List[Image.Image] = []
    for ln in lines:
        x_offset = 0
        segments = []
        for w in ln:
            color = HIGHLIGHT_COLOR if w.strip(",.!?;:").upper() in highlights else BASE_COLOR
            fnt   = ImageFont.truetype(font_path, size)
            w_w   = _measure(w, font_path, size)
            w_h   = fnt.getbbox(w)[3]
            img   = Image.new("RGBA", (w_w, w_h), (0, 0, 0, 0))
            ImageDraw.Draw(img).text((0, 0), w, font=fnt, fill=color)
            segments.append((img, x_offset))
            x_offset += w_w + space

        line_img = Image.new("RGBA", (x_offset - space, w_h), (0, 0, 0, 0))
        for seg, x in segments:
            line_img.paste(seg, (x, 0), seg)
        rendered.append(line_img)

    total_h = sum(im.height for im in rendered) + line_gap * (len(rendered) - 1)
    canvas  = Image.new("RGBA", (max_width, total_h), (0, 0, 0, 0))
    y = 0
    for im in rendered:
        canvas.paste(im, ((max_width - im.width) // 2, y), im)
        y += im.height + line_gap
    return canvas

# ── S3 helpers ───────────────────────────────────────────────────────────────
def _download(bucket: str, key: str, dest: str) -> bool:
    try:
        s3.download_file(bucket, key, dest)
        return True
    except Exception as exc:
        logger.warning("Download %s/%s failed: %s", bucket, key, exc)
        return False

def _fetch_gradient() -> Image.Image | None:
    tmp = "/tmp/gradient.png"
    return (Image.open(tmp).convert("RGBA").resize((WIDTH, HEIGHT))
            if _download(TARGET_BUCKET, GRADIENT_KEY, tmp) else None)

def _fetch_logo() -> Image.Image | None:
    tmp = "/tmp/logo.png"
    if not _download(TARGET_BUCKET, LOGO_KEY, tmp):
        return None
    logo = Image.open(tmp).convert("RGBA")
    scale = 200 / logo.width
    return logo.resize((int(logo.width * scale), int(logo.height * scale)))

def _fetch_background(bucket: str, bg_type: str, key: str) -> Image.Image | None:
    if not key or bg_type == "video":
        return None
    tmp = "/tmp/bg.jpg"
    if not _download(bucket, key, tmp):
        return None
    return Image.open(tmp).convert("RGBA").resize((WIDTH, HEIGHT))

# ── Rendering single item ───────────────────────────────────────────────────
def _render_item(item: Dict[str, Any]) -> Image.Image:
    bg  = _fetch_background(item.get("s3Bucket", TARGET_BUCKET),
                            item.get("backgroundType", "image"),
                            item.get("s3Key", ""))

    canvas = Image.new("RGBA", (WIDTH, HEIGHT), BACKGROUND_COLOR)
    if bg:
        canvas.paste(bg, (0, 0))

    if (grad := _fetch_gradient()):
        canvas.alpha_composite(grad)

    title = item["title"].upper()
    subtitle = (item.get("subtitle") or "").upper()

    hl_title = {w.strip().upper() for w in (item.get("highlightWordsTitle") or "").split(",") if w.strip()}
    hl_desc  = {w.strip().upper() for w in (item.get("highlightWordsDescription") or "").split(",") if w.strip()}

    title_sz = _autosize(title, TITLE_MAX, TITLE_MIN, 30)
    title_img = _multiline_colored(title, hl_title, FONT_PATH_TITLE, title_sz, 1000)
    canvas.alpha_composite(title_img, ((WIDTH - title_img.width) // 2, 275))

    if subtitle:
        desc_sz = _autosize(subtitle, DESC_MAX, DESC_MIN, 45)
        desc_img = _multiline_colored(subtitle, hl_desc, FONT_PATH_DESC, desc_sz, 900)
        y_desc = HEIGHT - 300 - desc_img.height
        canvas.alpha_composite(desc_img, ((WIDTH - desc_img.width) // 2, y_desc))

    if (logo := _fetch_logo()):
        lx = WIDTH - logo.width - 50
        ly = HEIGHT - logo.height - 100
        line = Image.new("RGBA", (700, 4), ImageColor.getrgb(HIGHLIGHT_COLOR) + (255,))
        canvas.alpha_composite(line, (lx - 720, ly + logo.height // 2 - 2))
        canvas.alpha_composite(logo, (lx, ly))

    return canvas.convert("RGB")

# ── DynamoDB helpers ─────────────────────────────────────────────────────────
def _list_accounts() -> Set[str]:
    """Return unique accountName values present in the table."""
    paginator = table.meta.client.get_paginator("scan")
    seen: Set[str] = set()
    for page in paginator.paginate(
        TableName=NEWS_TABLE,
        ProjectionExpression="accountName"
    ):
        for entry in page.get("Items", []):
            seen.add(entry["accountName"])
    return seen

def _latest_items(account: str, limit: int = 4) -> List[Dict[str, Any]]:
    return table.query(
        KeyConditionExpression=Key("accountName").eq(account),
        ScanIndexForward=False,
        Limit=limit,
    )["Items"]

# ── Lambda entry point ───────────────────────────────────────────────────────
def lambda_handler(event: Dict[str, Any], _ctx: Any) -> Dict[str, Any]:
    logger.info("weekly_news_recap start")

    accounts = _list_accounts()
    logger.info("Found %d account(s) with NEWS posts", len(accounts))

    summary: Dict[str, int] = {}

    for account in accounts:
        items = _latest_items(account)
        if not items:
            continue

        image_keys: List[str] = []
        ts_prefix = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")

        for idx, itm in enumerate(items):
            img = _render_item(itm)
            key = f"weekly_recap/{account}/recap_{ts_prefix}_{idx:03d}.png"

            buf = io.BytesIO()
            img.save(buf, format="PNG", compress_level=3)
            buf.seek(0)
            s3.upload_fileobj(buf, TARGET_BUCKET, key,
                              ExtraArgs={"ContentType": "image/png"})
            image_keys.append(key)
            logger.info("Uploaded %s", key)

        # Fire‑and‑forget call to notify_post
        lambda_cl.invoke(
            FunctionName=NOTIFY_POST_ARN,
            InvocationType="Event",
            Payload=json.dumps({
                "accountName": account,
                "imageKeys": image_keys
            }).encode("utf-8"),
        )
        summary[account] = len(image_keys)
        logger.info("Invoked notify_post for %s with %d thumbnail(s)",
                    account, len(image_keys))

    return {"status": "complete", "accounts": summary}
