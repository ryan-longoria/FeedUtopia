import datetime
import io
import json
import logging
import os
from typing import Any, Dict, List, Set

import boto3
from boto3.dynamodb.conditions import Key
from PIL import Image, ImageColor, ImageDraw, ImageFont

logger = logging.getLogger()
logger.setLevel(logging.INFO)

WIDTH, HEIGHT          = 1080, 1350
BACKGROUND_COLOR       = (0, 0, 0)
GRADIENT_KEY           = "artifacts/Black Gradient.png"
ROOT                   = os.path.dirname(__file__)
FONT_PATH_TITLE        = os.path.join(ROOT, "ariblk.ttf")
FONT_PATH_DESC         = os.path.join(ROOT, "Montserrat-Medium.ttf")
TITLE_MAX, TITLE_MIN   = 90, 60
DESC_MAX,  DESC_MIN    = 60, 30
HIGHLIGHT_COLOR        = "#ec008c"
BASE_COLOR             = "white"

TARGET_BUCKET   = os.environ["TARGET_BUCKET"]
NEWS_TABLE      = os.environ["NEWS_TABLE"]
NOTIFY_POST_ARN = os.environ["NOTIFY_POST_FUNCTION_ARN"]

dynamodb  = boto3.resource("dynamodb")
table     = dynamodb.Table(NEWS_TABLE)
s3        = boto3.client("s3")
lambda_cl = boto3.client("lambda")

def _measure(word: str, font_path: str, size: int) -> int:
    return ImageFont.truetype(font_path, size).getbbox(word)[2]

def _autosize(text: str, hi: int, lo: int, ideal: int) -> int:
    if len(text) <= ideal:
        return hi
    size = hi - (len(text) - ideal) * (hi - lo) / ideal
    return max(int(size), lo)

def multiline_colored(text: str,
                      highlights: Set[str],
                      font_path: str,
                      font_size: int,
                      max_width: int,
                      space: int = 15,
                      line_gap: int = 10) -> Image.Image:
    """Word‑wrap & colour selected words, return RGBA image."""
    words, lines, cur, line_w = text.split(), [], [], 0
    for w in words:
        w_w = _measure(w, font_path, font_size)
        if line_w + (w_w if not cur else w_w + space) <= max_width:
            cur.append(w); line_w += (w_w if not cur else w_w + space)
        else:
            lines.append(cur); cur, line_w = [w], w_w
    if cur: lines.append(cur)

    rendered: List[Image.Image] = []
    for line in lines:
        x_offset, parts = 0, []
        for w in line:
            color = HIGHLIGHT_COLOR if w.strip(",.!?;:").upper() in highlights else BASE_COLOR
            font  = ImageFont.truetype(font_path, font_size)
            w_w   = font.getbbox(w)[2]
            w_h   = font.getbbox(w)[3]
            img   = Image.new("RGBA", (w_w, w_h), (0, 0, 0, 0))
            ImageDraw.Draw(img).text((0, 0), w, font=font, fill=color)
            parts.append((img, x_offset))
            x_offset += w_w + space
        line_img = Image.new("RGBA", (x_offset - space, w_h), (0, 0, 0, 0))
        for seg, x in parts:
            line_img.paste(seg, (x, 0), seg)
        rendered.append(line_img)

    total_h = sum(im.height for im in rendered) + line_gap * (len(rendered) - 1)
    canvas  = Image.new("RGBA", (max_width, total_h), (0, 0, 0, 0))
    y = 0
    for ln in rendered:
        canvas.paste(ln, ((max_width - ln.width) // 2, y), ln)
        y += ln.height + line_gap
    return canvas

def _dl(key: str, dest: str) -> bool:
    try:
        s3.download_file(TARGET_BUCKET, key, dest)
        return True
    except Exception as exc:
        logger.warning("Download %s failed: %s", key, exc)
        return False

def fetch_gradient() -> Image.Image | None:
    tmp = "/tmp/gradient.png"
    return (Image.open(tmp).convert("RGBA").resize((WIDTH, HEIGHT))
            if _dl(GRADIENT_KEY, tmp) else None)

def fetch_logo(account: str) -> Image.Image | None:
    tmp = "/tmp/logo.png"
    logo_key = f"artifacts/{account}/logo.png"
    if not _dl(logo_key, tmp):
        return None
    logo = Image.open(tmp).convert("RGBA")
    scale = 200 / logo.width
    return logo.resize((int(logo.width * scale), int(logo.height * scale)))

def fetch_background(bucket: str, bg_type: str, key: str) -> Image.Image | None:
    if not key or bg_type == "video":
        return None

    tmp = "/tmp/bg.jpg"
    try:
        s3.download_file(bucket, key, tmp)
    except Exception as exc:
        logger.warning("Download %s/%s failed: %s", bucket, key, exc)
        return None

    img = Image.open(tmp).convert("RGBA")

    if img.width == 1080 and img.height >= HEIGHT:
        top = 0
        left = 0
        right = 1080
        bottom = HEIGHT
        return img.crop((left, top, right, bottom))

    img = img.resize((1080, int(img.height * (1080 / img.width))))
    return img.crop((0, 0, 1080, HEIGHT))

def render_item(item: Dict[str, Any], account: str) -> Image.Image:
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), BACKGROUND_COLOR)

    bg = fetch_background(TARGET_BUCKET,
                          item.get("backgroundType", "image"),
                          item.get("s3Key", ""))
    if bg:
        canvas.paste(bg, (0, 0))

    if (grad := fetch_gradient()):
        canvas.alpha_composite(grad)

    title     = item["title"].upper()
    subtitle  = (item.get("subtitle") or "").upper()

    hl_title  = {w.strip().upper() for w in (item.get("highlightWordsTitle") or "").split(",") if w.strip()}
    hl_sub    = {w.strip().upper() for w in (item.get("highlightWordsDescription") or "").split(",") if w.strip()}

    title_img = multiline_colored(
        title, hl_title,
        FONT_PATH_TITLE,
        _autosize(title, TITLE_MAX, TITLE_MIN, 30),
        1000
    )

    sub_img = None
    if subtitle:
        sub_img = multiline_colored(
            subtitle, hl_sub,
            FONT_PATH_DESC,
            _autosize(subtitle, DESC_MAX, DESC_MIN, 45),
            900
        )

    BOTTOM_MARGIN = 250
    GAP           = 30

    if sub_img:
        sub_y   = HEIGHT - BOTTOM_MARGIN - sub_img.height
        title_y = sub_y - GAP - title_img.height
        canvas.alpha_composite(title_img, ((WIDTH - title_img.width)//2, title_y))
        canvas.alpha_composite(sub_img, ((WIDTH - sub_img.width)//2, sub_y))
    else:
        title_y = HEIGHT - BOTTOM_MARGIN - title_img.height
        canvas.alpha_composite(title_img, ((WIDTH - title_img.width)//2, title_y))

    if (logo := fetch_logo(account)):
        lx = WIDTH - logo.width - 50
        ly = HEIGHT - logo.height - 50
        line = Image.new("RGBA", (700, 4),
                         ImageColor.getrgb(HIGHLIGHT_COLOR) + (255,))
        canvas.alpha_composite(line, (lx - 720, ly + logo.height//2 - 2))
        canvas.alpha_composite(logo, (lx, ly))

    return canvas.convert("RGB")

def list_accounts() -> Set[str]:
    paginator = table.meta.client.get_paginator("scan")
    seen: Set[str] = set()
    for page in paginator.paginate(
        TableName=NEWS_TABLE,
        ProjectionExpression="accountName"
    ):
        for itm in page.get("Items", []):
            seen.add(itm["accountName"])
    return seen

def latest_items_for_account(account: str, limit: int = 4) -> List[Dict[str, Any]]:
    return table.query(
        KeyConditionExpression=Key("accountName").eq(account),
        ScanIndexForward=False,
        Limit=limit
    )["Items"]

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
        ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")

        for i, item in enumerate(items):
            img = render_item(item, account)
            key = f"weekly_recap/{account}/recap_{ts}_{i:03d}.png"
            buf = io.BytesIO()
            img.save(buf, format="PNG", compress_level=3)
            buf.seek(0)
            s3.upload_fileobj(buf, TARGET_BUCKET, key,
                              ExtraArgs={"ContentType": "image/png"})
            image_keys.append(key)
            logger.info("Uploaded %s", key)

        lambda_cl.invoke(
            FunctionName   = NOTIFY_POST_ARN,
            InvocationType = "Event",
            Payload        = json.dumps({
                                "accountName": account,
                                "imageKeys"  : image_keys
                             }).encode(),
        )
        summary[account] = len(image_keys)
        logger.info("Invoked notify_post for %s with %d thumbnail(s)",
                    account, len(image_keys))

    return {"status": "complete", "accounts": summary}
