import datetime as dt
import io
import json
import logging
import os
import time
from typing import Any, Dict, List, Set

import boto3
from boto3.dynamodb.conditions import Attr
from PIL import Image, ImageColor, ImageDraw, ImageFont

###############################################################################
# CONSTANTS & GLOBALS
###############################################################################
logger = logging.getLogger()
logger.setLevel(logging.INFO)

WIDTH, HEIGHT = 1080, 1350
BACKGROUND_COLOR = (0, 0, 0)
GRADIENT_KEY = "artifacts/Black Gradient.png"
LOGO_KEY     = "artifacts/Logo.png"

ROOT = os.path.dirname(__file__)
FONT_PATH_TITLE = os.path.join(ROOT, "ariblk.ttf")          # Arial Black
FONT_PATH_DESC  = os.path.join(ROOT, "Montserrat-Medium.ttf")

DEFAULT_TITLE_MAX = 90
DEFAULT_TITLE_MIN = 60
DEFAULT_DESC_MAX  = 60
DEFAULT_DESC_MIN  = 30
HIGHLIGHT_COLOR   = "#ec008c"
DEFAULT_COLOR     = "white"

TARGET_BUCKET        = os.environ["TARGET_BUCKET"]
NEWS_TABLE           = os.environ["NEWS_TABLE"]
NOTIFY_POST_FUNCTION = os.environ["NOTIFY_POST_FN_ARN"]     #  ⇒ terraform variable

s3        = boto3.client("s3")
dynamodb  = boto3.resource("dynamodb")
lambda_cl = boto3.client("lambda")
table     = dynamodb.Table(NEWS_TABLE)

###############################################################################
# TEXT HELPERS
###############################################################################
def measure_text_width(word: str, font_path: str, font_size: int) -> int:
    fnt = ImageFont.truetype(font_path, font_size)
    return fnt.getbbox(word)[2]

def dynamic_font_size(txt: str, mx: int, mn: int, ideal: int) -> int:
    if len(txt) <= ideal:
        return mx
    step = (mx - mn) / ideal
    sz   = mx - (len(txt) - ideal) * step
    return max(int(sz), mn)

def multiline_colored(
    text: str,
    highlight: Set[str],
    font_path: str,
    font_size: int,
    max_width: int,
    space: int = 15,
    line_spacing: int = 10,
) -> Image.Image:
    words = text.split()
    lines, cur, cur_w = [], [], 0
    for w in words:
        w_w = measure_text_width(w, font_path, font_size)
        extra = w_w if not cur else w_w + space
        if cur_w + extra <= max_width:
            cur.append(w); cur_w += extra
        else:
            lines.append(cur); cur, cur_w = [w], w_w
    if cur: lines.append(cur)

    line_imgs = []
    for line in lines:
        x = 0
        segments = []
        for w in line:
            clean = w.strip(",.!?;:").upper()
            colour = HIGHLIGHT_COLOR if clean in highlight else DEFAULT_COLOR
            fnt = ImageFont.truetype(font_path, font_size)
            bbox = fnt.getbbox(w)
            w_w, w_h = bbox[2]-bbox[0], bbox[3]-bbox[1]
            img = Image.new("RGBA", (w_w, w_h), (0,0,0,0))
            ImageDraw.Draw(img).text((0,0), w, font=fnt, fill=colour)
            segments.append((img, x))
            x += w_w + space
        line_img = Image.new("RGBA", (x-space, w_h), (0,0,0,0))
        for seg, xoff in segments:
            line_img.paste(seg, (xoff, 0), seg)
        line_imgs.append(line_img)

    total_h = sum(im.height for im in line_imgs) + line_spacing*(len(line_imgs)-1)
    canvas  = Image.new("RGBA", (max_width, total_h), (0,0,0,0))
    y = 0
    for im in line_imgs:
        canvas.paste(im, ((max_width-im.width)//2, y), im)
        y += im.height + line_spacing
    return canvas

###############################################################################
# S3 HELPERS
###############################################################################
def download_s3(key: str, dst: str) -> bool:
    try:
        s3.download_file(TARGET_BUCKET, key, dst)
        return True
    except Exception as exc:
        logger.warning("Download %s failed: %s", key, exc)
        return False

def fetch_gradient() -> Image.Image | None:
    path = "/tmp/gradient.png"
    if download_s3(GRADIENT_KEY, path):
        return Image.open(path).convert("RGBA").resize((WIDTH, HEIGHT))
    return None

def fetch_logo() -> Image.Image | None:
    path = "/tmp/logo.png"
    if download_s3(LOGO_KEY, path):
        logo = Image.open(path).convert("RGBA")
        scale = 200 / logo.width
        return logo.resize((int(logo.width*scale), int(logo.height*scale)))
    return None

def fetch_bg(bg_type: str, key: str) -> Image.Image | None:
    if not key:
        return None
    tmp = "/tmp/bg.jpg"
    if not download_s3(key, tmp):
        return None
    if bg_type.lower() == "video":
        logger.warning("Video backgrounds not supported for recap image")
        return None
    return Image.open(tmp).convert("RGBA").resize((WIDTH, HEIGHT))

###############################################################################
# IMAGE RENDER
###############################################################################
def render_image(item: Dict[str, Any]) -> Image.Image:
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), BACKGROUND_COLOR)

    bg = fetch_bg(item.get("backgroundType", "image"), item.get("s3Key", ""))
    if bg: canvas.paste(bg, (0,0))

    grad = fetch_gradient()
    if grad: canvas.alpha_composite(grad)

    title = item["title"].upper()
    subtitle = (item.get("subtitle") or "").upper()

    hl_title = {w.strip().upper() for w in (item.get("highlightWordsTitle") or "").split(",") if w.strip()}
    hl_sub   = {w.strip().upper() for w in (item.get("highlightWordsDescription") or "").split(",") if w.strip()}

    title_sz = dynamic_font_size(title, DEFAULT_TITLE_MAX, DEFAULT_TITLE_MIN, 30)
    title_img = multiline_colored(title, hl_title, FONT_PATH_TITLE, title_sz, 1000)

    desc_img = None
    if subtitle:
        desc_sz = dynamic_font_size(subtitle, DEFAULT_DESC_MAX, DEFAULT_DESC_MIN, 45)
        desc_img = multiline_colored(subtitle, hl_sub, FONT_PATH_DESC, desc_sz, 900)

    canvas.alpha_composite(title_img, ((WIDTH-title_img.width)//2, 275))
    if desc_img:
        canvas.alpha_composite(desc_img,
                               ((WIDTH-desc_img.width)//2, HEIGHT-300-desc_img.height))

    logo = fetch_logo()
    if logo:
        lx = WIDTH - logo.width - 50
        ly = HEIGHT - logo.height - 100
        line = Image.new("RGBA", (700,4), ImageColor.getrgb(HIGHLIGHT_COLOR)+(255,))
        canvas.alpha_composite(line, (lx-700-20, ly+logo.height//2-2))
        canvas.alpha_composite(logo, (lx, ly))

    return canvas.convert("RGB")

###############################################################################
# NOTIFY TEAMS
###############################################################################
def notify_teams(account: str, image_key: str) -> None:
    """
    Fire‑and‑forget invoke of the notify_post Lambda so the recap image
    lands in the right Teams channel.
    """
    payload = {
        "accountName": account,
        "videoResult": {"video_key": image_key},   # notify_post expects this field
        "isWeeklyRecap": True
    }
    lambda_cl.invoke(
        FunctionName=NOTIFY_POST_FUNCTION,
        InvocationType="Event",   # async
        Payload=json.dumps(payload).encode(),
    )
    logger.info("notify_post invoked for %s (%s)", account, image_key)

###############################################################################
# LAMBDA ENTRY
###############################################################################
def lambda_handler(event: Dict[str, Any], _ctx) -> Dict[str, str]:
    """
    • Scan for all NEWS posts created in the last 7 days  
    • Generate a PNG for *each* record  
    • Upload to S3 and ping Teams via notify_post
    """
    logger.info("weekly_news_recap started")
    one_week_ago = int(time.time()) - 7*24*3600

    scan_kwargs = {
        "FilterExpression": Attr("createdAt").gte(one_week_ago)
    }

    processed: List[str] = []
    try:
        paginator = table.meta.client.get_paginator("scan")
        for page in paginator.paginate(
            TableName=NEWS_TABLE,
            FilterExpression=scan_kwargs["FilterExpression"],
            ProjectionExpression="#n, createdAt, title, subtitle, "
                                 "highlightWordsTitle, highlightWordsDescription, "
                                 "backgroundType, s3Key",
            ExpressionAttributeNames={"#n": "accountName"},
        ):
            for item in page.get("Items", []):
                account = item["accountName"].lower()
                try:
                    img = render_image(item)
                    key = f"weekly_recap/{account}/{item['createdAt']}.png"
                    buf = io.BytesIO()
                    img.save(buf, format="PNG", compress_level=3)
                    buf.seek(0)
                    s3.upload_fileobj(buf, TARGET_BUCKET, key,
                                      ExtraArgs={"ContentType": "image/png"})
                    logger.info("Uploaded %s", key)
                    processed.append(key)
                    notify_teams(account, key)
                except Exception:
                    logger.exception("Failed to create/upload image for %s", item)
    except Exception as exc:
        logger.exception("DynamoDB scan failed: %s", exc)
        return {"status": "error", "message": "ddb scan failed"}

    return {"status": "ok", "generated": processed}
