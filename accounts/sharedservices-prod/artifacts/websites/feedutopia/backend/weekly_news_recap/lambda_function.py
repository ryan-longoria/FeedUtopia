import datetime as dt
import io
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional, Set, Tuple

import boto3
from boto3.dynamodb.conditions import Attr
from PIL import Image, ImageColor, ImageDraw, ImageFont

# ──────────────────────  CONFIG  ──────────────────────
WIDTH, HEIGHT = 1080, 1350
BACKGROUND_COLOR = (0, 0, 0, 255)

GRADIENT_KEY = "artifacts/Black Gradient.png"
LOGO_KEY     = "artifacts/Logo.png"

ROOT = os.path.dirname(__file__)
FONT_PATH_TITLE = os.path.join(ROOT, "ariblk.ttf")          # Arial Black
FONT_PATH_DESC  = os.path.join(ROOT, "Montserrat-Medium.ttf")

TITLE_MAX = 90
TITLE_MIN = 60
DESC_MAX  = 60
DESC_MIN  = 30
HIGHLIGHT = "#ec008c"
COLOR_DEF = "white"

TARGET_BUCKET = os.environ.get("TARGET_BUCKET", "prod-sharedservices-artifacts-bucket")
NEWS_TABLE    = os.environ["NEWS_TABLE"]
NOTIFY_POST_ARN = os.environ["NOTIFY_POST_FUNCTION_ARN"]    # <‑‑ set in TF

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3        = boto3.client("s3")
ddb       = boto3.resource("dynamodb")
lambda_cli = boto3.client("lambda")
table     = ddb.Table(NEWS_TABLE)

# ──────────────────────  TEXT HELPERS  ──────────────────────
def measure_width(word: str, font_path: str, size: int) -> int:
    return ImageFont.truetype(font_path, size).getbbox(word)[2]

def dynamic_size(text: str, max_s: int, min_s: int, ideal: int) -> int:
    if len(text) <= ideal:
        return max_s
    step = (max_s - min_s) / ideal
    return max(min_s, int(max_s - (len(text) - ideal) * step))

def multiline_colored(
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
        w_w = measure_width(w, font_path, size)
        add_w = w_w if not cur else w_w + space
        if cur_w + add_w <= max_width:
            cur.append(w); cur_w += add_w
        else:
            lines.append(cur); cur, cur_w = [w], w_w
    if cur: lines.append(cur)

    line_imgs: List[Image.Image] = []
    for line in lines:
        x_off = 0
        imgs = []
        for w in line:
            clean = w.strip(",.!?;:").upper()
            col   = HIGHLIGHT if clean in highlights else COLOR_DEF
            fnt   = ImageFont.truetype(font_path, size)
            w_w, w_h = fnt.getbbox(w)[2:]
            img = Image.new("RGBA", (w_w, w_h), (0,0,0,0))
            ImageDraw.Draw(img).text((0,0), w, font=fnt, fill=col)
            imgs.append((img, x_off))
            x_off += w_w + space
        strip = Image.new("RGBA", (x_off-space, w_h), (0,0,0,0))
        for im, x in imgs:
            strip.paste(im, (x,0), im)
        line_imgs.append(strip)

    tot_h = sum(im.height for im in line_imgs) + line_gap*(len(line_imgs)-1)
    canvas = Image.new("RGBA", (max_width, tot_h), (0,0,0,0))
    y = 0
    for im in line_imgs:
        canvas.paste(im, ((max_width-im.width)//2, y), im)
        y += im.height + line_gap
    return canvas

# ──────────────────────  S3 HELPERS  ──────────────────────
def dl(key: str, dst: str) -> bool:
    try:
        s3.download_file(TARGET_BUCKET, key, dst)
        return True
    except Exception as e:
        logger.debug("download %s failed: %s", key, e)
        return False

def fetch_img(key: str, size: Tuple[int,int]) -> Optional[Image.Image]:
    tmp = "/tmp/_bg"
    if not dl(key, tmp):
        return None
    return Image.open(tmp).convert("RGBA").resize(size)

def fetch_static(key: str) -> Optional[Image.Image]:
    tmp = "/tmp/"+os.path.basename(key).replace(" ","_")
    if dl(key, tmp):
        return Image.open(tmp).convert("RGBA")
    return None

# ──────────────────────  RENDER ONE POSTER  ──────────────────────
def render(item: Dict[str, Any]) -> Image.Image:
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), BACKGROUND_COLOR)

    if item.get("backgroundType","image") != "video" and item.get("s3Key"):
        bg = fetch_img(item["s3Key"], (WIDTH, HEIGHT))
        if bg:
            canvas.paste(bg, (0,0))

    grad = fetch_static(GRADIENT_KEY)
    if grad:
        canvas.alpha_composite(grad.resize((WIDTH, HEIGHT)))

    title    = item["title"].upper()
    subtitle = (item.get("subtitle") or "").upper()

    hl_title = {w.strip().upper() for w in (item.get("highlightWordsTitle") or "").split(",") if w.strip()}
    hl_desc  = {w.strip().upper() for w in (item.get("highlightWordsDescription") or "").split(",") if w.strip()}

    t_size = dynamic_size(title, TITLE_MAX, TITLE_MIN, 30)
    t_img  = multiline_colored(title, hl_title, FONT_PATH_TITLE, t_size, 1000)

    if subtitle:
        d_size = dynamic_size(subtitle, DESC_MAX, DESC_MIN, 45)
        d_img  = multiline_colored(subtitle, hl_desc, FONT_PATH_DESC, d_size, 900)
    else:
        d_img = None

    canvas.alpha_composite(t_img, ((WIDTH - t_img.width)//2, 275))
    if d_img:
        canvas.alpha_composite(d_img, ((WIDTH - d_img.width)//2, HEIGHT - 300 - d_img.height))

    logo = fetch_static(LOGO_KEY)
    if logo:
        scale = 200 / logo.width
        logo  = logo.resize((int(logo.width*scale), int(logo.height*scale)))
        lx = WIDTH - logo.width - 50
        ly = HEIGHT - logo.height - 100
        line = Image.new("RGBA", (700, 4), ImageColor.getrgb(HIGHLIGHT)+(255,))
        canvas.alpha_composite(line, (lx-700-20, ly+logo.height//2-2))
        canvas.alpha_composite(logo, (lx, ly))

    return canvas.convert("RGB")

# ──────────────────────  MAIN LAMBDA  ──────────────────────
def lambda_handler(event: Dict[str, Any], _ctx: Any) -> Dict[str, Any]:
    logger.info("weekly_news_recap started")

    seven_days_ago = int(time.time()) - 7*24*3600
    scan_kwargs = {
        "FilterExpression": Attr("createdAt").gte(seven_days_ago)
    }

    paginator = table.meta.client.get_paginator("scan")
    page_it   = paginator.paginate(TableName=NEWS_TABLE, **scan_kwargs)

    # account -> [image keys]
    acct_imgs: Dict[str, List[str]] = {}

    for page in page_it:
        for item in page.get("Items", []):
            acct = item["accountName"].lower()
            img  = render(item)

            ts = dt.datetime.utcnow().strftime("%Y%m%d_%H%M%S_%f")[:-3]
            key = f"weekly_recap/{acct}/recap_{ts}.png"

            buf = io.BytesIO();   img.save(buf, "PNG", compress_level=3);   buf.seek(0)
            s3.upload_fileobj(buf, TARGET_BUCKET, key, ExtraArgs={"ContentType":"image/png"})
            logger.info("Uploaded %s", key)

            acct_imgs.setdefault(acct, []).append(key)

    # notify teams ‑ one invoke per account
    for acct, keys in acct_imgs.items():
        payload = {
            "accountName": acct,
            "imageKeys":   keys,        # list[str]
        }
        lambda_cli.invoke(
            FunctionName = NOTIFY_POST_ARN,
            InvocationType = "Event",   # async
            Payload = json.dumps(payload).encode(),
        )
        logger.info("Invoked notify_post for %s (%d images)", acct, len(keys))

    return {"status": "ok", "accountsNotified": len(acct_imgs)}
