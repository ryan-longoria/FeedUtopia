import datetime
import io
import json
import logging
import os
import time
from typing import Any, Dict, Optional, Set, Tuple

import boto3
import requests
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
FONT_PATH_TITLE = os.path.join(ROOT, "ariblk.ttf")
FONT_PATH_DESC  = os.path.join(ROOT, "Montserrat-Medium.ttf")
DEFAULT_TITLE_MAX = 90
DEFAULT_TITLE_MIN = 60
DEFAULT_DESC_MAX  = 60
DEFAULT_DESC_MIN  = 30
HIGHLIGHT_COLOR   = "#ec008c"
DEFAULT_COLOR     = "white"

TARGET_BUCKET = os.environ.get("TARGET_BUCKET", "prod-sharedservices-artifacts-bucket")
NEWS_TABLE    = os.environ["NEWS_TABLE"]

s3    = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(NEWS_TABLE)

###############################################################################
# TEXT HELPERS (ported from MoviePy versions)
###############################################################################
def measure_text_width_pillow(word: str, font_path: str, font_size: int) -> int:
    fnt = ImageFont.truetype(font_path, font_size)
    return fnt.getbbox(word)[2]

def dynamic_font_size(text: str, max_size: int, min_size: int, ideal_len: int) -> int:
    if len(text) <= ideal_len:
        return max_size
    factor = (max_size - min_size) / ideal_len
    new_size = int(max_size - (len(text) - ideal_len) * factor)
    return max(new_size, min_size)

def multiline_colored(
    full_text: str,
    highlight_words: Set[str],
    font_path: str,
    font_size: int,
    max_width: int,
    space: int = 15,
    line_spacing: int = 10,
) -> Image.Image:
    """Return a PIL image containing wrapped, colour-highlighted text."""
    words = full_text.split()
    lines, current, cur_w = [], [], 0
    for w in words:
        w_w = measure_text_width_pillow(w, font_path, font_size)
        if cur_w + (w_w if not current else w_w + space) <= max_width:
            current.append(w)
            cur_w += (w_w if not current else w_w + space)
        else:
            lines.append(current); current, cur_w = [w], w_w
    if current: lines.append(current)

    line_imgs = []
    for line in lines:
        x = 0
        pieces = []
        for w in line:
            clean  = w.strip(",.!?;:").upper()
            color  = HIGHLIGHT_COLOR if clean in highlight_words else DEFAULT_COLOR
            fnt    = ImageFont.truetype(font_path, font_size)

            bbox   = fnt.getbbox(w)
            w_w    = bbox[2] - bbox[0]
            w_h    = bbox[3] - bbox[1]

            img = Image.new("RGBA", (w_w, w_h), (255, 0, 0, 0))
            d = ImageDraw.Draw(img)
            d.text((0,0), w, font=fnt, fill=color)
            pieces.append((img, x))
            x += w_w + space
        line_img = Image.new("RGBA", (x-space, w_h), (255,0,0,0))
        for img, xoff in pieces:
            line_img.paste(img, (xoff, 0), img)
        line_imgs.append(line_img)

    total_h = sum(im.height for im in line_imgs) + line_spacing*(len(line_imgs)-1)
    final = Image.new("RGBA", (max_width, total_h), (255,0,0,0))
    y=0
    for im in line_imgs:
        final.paste(im, ((max_width - im.width)//2, y), im)
        y += im.height + line_spacing
    return final

###############################################################################
# S3 HELPERS
###############################################################################
def download_s3(key: str, local_path: str) -> bool:
    try:
        s3.download_file(TARGET_BUCKET, key, local_path)
        logger.info("Downloaded %s", key)
        return True
    except Exception as exc:
        logger.warning("Could not download %s: %s", key, exc)
        return False

def fetch_gradient() -> Optional[Image.Image]:
    tmp = "/tmp/gradient.png"
    if download_s3(GRADIENT_KEY, tmp):
        return Image.open(tmp).convert("RGBA").resize((WIDTH, HEIGHT))
    return None

def fetch_logo() -> Optional[Image.Image]:
    tmp = "/tmp/logo.png"
    if download_s3(LOGO_KEY, tmp):
        logo = Image.open(tmp).convert("RGBA")
        scale = 200 / logo.width
        return logo.resize((int(logo.width*scale), int(logo.height*scale)))
    return None

def fetch_bg(bg_type: str, bg_key: str) -> Optional[Image.Image]:
    if not bg_key:
        return None
    tmp = "/tmp/bg"
    tmp += ".mp4" if bg_type == "video" else ".img"
    if not download_s3(bg_key, tmp):
        return None
    if bg_type == "video":
        logger.warning("Video backgrounds are not supported for recap image")
        return None
    return Image.open(tmp).convert("RGBA").resize((WIDTH, HEIGHT))

###############################################################################
# MAIN RENDER
###############################################################################
def render_recap_image(item: Dict[str, Any]) -> Image.Image:
    """
    Build the recap poster from one DynamoDB item.  If you want to collage
    several items, call this repeatedly and composite as you like.
    """
    bg = fetch_bg(item.get("backgroundType","image"), item.get("s3Key", ""))
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), BACKGROUND_COLOR)
    if bg:
        canvas.paste(bg, (0,0))
    gradient = fetch_gradient()
    if gradient:
        canvas.alpha_composite(gradient)

    title = item["title"].upper()
    subtitle = (item.get("subtitle") or "").upper()

    hl_title  = {w.strip().upper() for w in (item.get("highlightWordsTitle") or "").split(",") if w.strip()}
    hl_sub    = {w.strip().upper() for w in (item.get("highlightWordsDescription") or "").split(",") if w.strip()}

    title_size = dynamic_font_size(title, DEFAULT_TITLE_MAX, DEFAULT_TITLE_MIN, 30)
    title_img  = multiline_colored(title, hl_title, FONT_PATH_TITLE, title_size, 1000)

    if subtitle:
        desc_size  = dynamic_font_size(subtitle, DEFAULT_DESC_MAX, DEFAULT_DESC_MIN, 45)
        desc_img   = multiline_colored(subtitle, hl_sub, FONT_PATH_DESC, desc_size, 900)
    else:
        desc_img = None

    title_x = (WIDTH - title_img.width)//2
    title_y = 275
    canvas.alpha_composite(title_img, (title_x, title_y))

    if desc_img:
        desc_x = (WIDTH - desc_img.width)//2
        desc_y = HEIGHT - 300 - desc_img.height
        canvas.alpha_composite(desc_img, (desc_x, desc_y))

    logo = fetch_logo()
    if logo:
        lx = WIDTH - logo.width - 50
        ly = HEIGHT - logo.height - 100
        line = Image.new("RGBA", (700, 4), ImageColor.getrgb(HIGHLIGHT_COLOR)+(255,))
        canvas.alpha_composite(line, (lx - 700 - 20, ly + logo.height//2 - 2))
        canvas.alpha_composite(logo, (lx, ly))

    return canvas.convert("RGB")

###############################################################################
# LAMBDA ENTRY
###############################################################################
def lambda_handler(event: Dict[str, Any], _ctx: Any) -> Dict[str, str]:
    """
    1. Query DynamoDB for this week's NEWS posts (for the first account only).
    2. Render the first one into a PNG poster.
    3. Upload to S3  (posts/recap_YYYYMMDD_HHMM.png).
    """
    logger.info("weekly_news_recap start")
    account_name = (event.get("accountName") or "animeutopia").lower()

    try:
        resp = table.query(
            KeyConditionExpression="accountName = :n",
            ExpressionAttributeValues={":n": account_name},
            ScanIndexForward=False,
            Limit=1,
        )
    except Exception as exc:
        logger.exception("DynamoDB query failed: %s", exc)
        return {"status": "error", "message": "ddb failure"}

    if not resp.get("Items"):
        logger.warning("No NEWS items found for %s", account_name)
        return {"status": "empty"}

    item = resp["Items"][0]
    image = render_recap_image(item)

    key = f"weekly_recap/recap_{datetime.datetime.utcnow():%Y%m%d_%H%M%S}.png"
    buf = io.BytesIO()
    image.save(buf, format="PNG", compress_level=3)
    buf.seek(0)
    s3.upload_fileobj(buf, TARGET_BUCKET, key, ExtraArgs={"ContentType": "image/png"})
    logger.info("Uploaded recap image to s3://%s/%s", TARGET_BUCKET, key)

    return {"status": "rendered", "s3_key": key}
