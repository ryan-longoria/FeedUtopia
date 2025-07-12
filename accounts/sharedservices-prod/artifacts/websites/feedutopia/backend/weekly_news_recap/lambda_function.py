import datetime
import io
import json
import logging
import os
import tempfile
from typing import Any, Dict, List, Set

import boto3
from boto3.dynamodb.conditions import Key
from PIL import Image, ImageColor, ImageDraw, ImageFont

try:
    from moviepy.video.io.VideoFileClip import VideoFileClip
except ImportError:
    VideoFileClip = None

logger = logging.getLogger()
logger.setLevel(logging.INFO)
logging.basicConfig(format="%(asctime)s %(levelname)s %(message)s", level=logging.INFO)

WIDTH, HEIGHT = 1080, 1350
TITLE_MAX, TITLE_MIN = 90, 60
DESC_MAX, DESC_MIN = 60, 30
HIGHLIGHT_COLOR = "#ec008c"
BASE_COLOR = "white"

GRADIENT_KEY = "artifacts/Black Gradient.png"
ROOT = os.path.dirname(__file__)
FONT_PATH_TITLE = os.path.join(ROOT, "ariblk.ttf")
FONT_PATH_DESC = os.path.join(ROOT, "Montserrat-Medium.ttf")

TARGET_BUCKET = os.environ["TARGET_BUCKET"]
NEWS_TABLE = os.environ["NEWS_TABLE"]
NOTIFY_POST_ARN = os.environ["NOTIFY_POST_FUNCTION_ARN"]

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(NEWS_TABLE)
s3 = boto3.client("s3")
lambda_cl = boto3.client("lambda")


def measure(word: str, font: ImageFont.FreeTypeFont) -> int:
    return font.getbbox(word)[2]


def autosize(text: str, max_size: int, min_size: int, ideal: int) -> int:
    size = max_size if len(text) <= ideal else max_size - (len(text) - ideal) * (max_size - min_size) / ideal
    result = max(int(size), min_size)
    logger.debug(f"autosize: text_len={len(text)} -> {result}")
    return result


def multiline_colored(text: str, highlights: Set[str], font_path: str, font_size: int, max_width: int, space: int = 15) -> Image.Image:
    logger.info(f"multiline_colored start: '{text[:30]}...' font_size={font_size} max_width={max_width}")
    font = ImageFont.truetype(font_path, font_size)
    words, lines, cur, cur_w = text.split(), [], [], 0
    for w in words:
        w_w = measure(w, font)
        add = w_w if not cur else w_w + space
        if cur_w + add <= max_width:
            cur.append(w)
            cur_w += add
        else:
            lines.append(cur)
            cur, cur_w = [w], w_w
    if cur:
        lines.append(cur)
    rendered: List[Image.Image] = []
    for ln in lines:
        x, pieces = 0, []
        for w in ln:
            color = HIGHLIGHT_COLOR if w.strip(",.!?;:").upper() in highlights else BASE_COLOR
            img = Image.new("RGBA", font.getbbox(w)[2:], (0, 0, 0, 0))
            ImageDraw.Draw(img).text((0, 0), w, font=font, fill=color)
            pieces.append((img, x))
            x += img.width + space
        line_img = Image.new("RGBA", (x - space, font.size), (0, 0, 0, 0))
        for img, x_off in pieces:
            line_img.paste(img, (x_off, 0), img)
        rendered.append(line_img)
    total_h = sum(i.height for i in rendered) + 10 * (len(rendered) - 1)
    canvas = Image.new("RGBA", (max_width, total_h), (0, 0, 0, 0))
    y = 0
    for img in rendered:
        canvas.paste(img, ((max_width - img.width) // 2, y), img)
        y += img.height + 10
    logger.info(f"multiline_colored done: output_height={total_h}")
    return canvas


def download_to_tmp(key: str) -> str | None:
    local = os.path.join(tempfile.gettempdir(), os.path.basename(key))
    try:
        logger.info(f"Downloading S3://{TARGET_BUCKET}/{key} to {local}")
        s3.download_file(TARGET_BUCKET, key, local)
        return local
    except Exception as exc:
        logger.error(f"download_to_tmp failed for {key}: {exc}")
        return None


def fetch_gradient() -> Image.Image | None:
    p = download_to_tmp(GRADIENT_KEY)
    if not p:
        logger.warning("No gradient file")
        return None
    logger.info("Loading gradient")
    return Image.open(p).convert("RGBA").resize((WIDTH, HEIGHT))


def fetch_logo(account: str) -> Image.Image | None:
    key = f"artifacts/{account.lower()}/logo.png"
    p = download_to_tmp(key)
    if not p:
        logger.warning(f"No logo for account={account}")
        return None
    logo = Image.open(p).convert("RGBA")
    scale = 200 / logo.width
    resized = logo.resize((int(logo.width * scale), int(logo.height * scale)))
    logger.info(f"Logo loaded, size={resized.size}")
    return resized


def fetch_background(bg_type: str, key: str) -> Image.Image | None:
    logger.info(f"fetch_background type={bg_type} key={key}")
    if not key:
        logger.warning("No background key provided")
        return None
    local = download_to_tmp(key)
    if not local:
        return None
    if bg_type == "video":
        if VideoFileClip is None:
            logger.error("MoviePy missing")
            return None
        try:
            with VideoFileClip(local) as clip:
                frame = clip.get_frame(clip.duration / 2)
            img = Image.fromarray(frame).convert("RGBA")
            logger.info("Extracted video frame")
        except Exception as exc:
            logger.error(f"Video frame extract failed: {exc}")
            return None
    else:
        img = Image.open(local).convert("RGBA")
        logger.info("Loaded image background")
    scale = WIDTH / img.width
    new_h = int(img.height * scale)
    img = img.resize((WIDTH, new_h), Image.LANCZOS)
    if new_h > HEIGHT:
        y0 = (new_h - HEIGHT) // 2
        img = img.crop((0, y0, WIDTH, y0 + HEIGHT))
    logger.info(f"Background resized to {(WIDTH, HEIGHT)}")
    return img


def render_item(item: Dict[str, Any], account: str) -> Image.Image:
    logger.info(f"render_item start for account={account}")
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))
    bg_type = item.get("backgroundType", "image").lower()
    bg = fetch_background(bg_type, item.get("s3Key", ""))
    if bg:
        canvas.paste(bg, (0, 0))
    grad = fetch_gradient()
    if grad:
        canvas.alpha_composite(grad)
    title = (item["title"] or "").upper()
    subtitle = (item.get("subtitle") or "").upper()
    hl_title = {w.strip().upper() for w in (item.get("highlightWordsTitle") or "").split(",") if w.strip()}
    hl_sub = {w.strip().upper() for w in (item.get("highlightWordsDescription") or "").split(",") if w.strip()}
    t_font = autosize(title, TITLE_MAX, TITLE_MIN, 30)
    s_font = autosize(subtitle, DESC_MAX, DESC_MIN, 45)
    t_img = multiline_colored(title, hl_title, FONT_PATH_TITLE, t_font, 1000)
    sub_img = multiline_colored(subtitle, hl_sub, FONT_PATH_DESC, s_font, 900) if subtitle else None
    y_title = 260
    logger.info(f"Placing title at y={y_title}")
    canvas.alpha_composite(t_img, ((WIDTH - t_img.width) // 2, y_title))
    if sub_img:
        if bg_type == "image":
            y_sub = y_title + t_img.height + 50
        else:
            y_sub = HEIGHT - 335 - sub_img.height
        logger.info(f"Placing subtitle at y={y_sub} for bg_type={bg_type}")
        draw = ImageDraw.Draw(canvas)
        draw.line([(0, y_sub), (WIDTH, y_sub)], fill="red", width=3)
        canvas.alpha_composite(sub_img, ((WIDTH - sub_img.width) // 2, y_sub))
    logo = fetch_logo(account)
    if logo:
        lx = WIDTH - logo.width - 50
        ly = HEIGHT - logo.height - 50
        stripe = Image.new("RGBA", (700, 4), ImageColor.getrgb(HIGHLIGHT_COLOR) + (255,))
        canvas.alpha_composite(stripe, (lx - 720, ly + logo.height // 2 - 2))
        canvas.alpha_composite(logo, (lx, ly))
    logger.info("render_item done")
    return canvas.convert("RGB")


def list_accounts() -> Set[str]:
    seen: Set[str] = set()
    for page in table.meta.client.get_paginator("scan").paginate(TableName=NEWS_TABLE, ProjectionExpression="accountName"):
        for i in page.get("Items", []):
            seen.add(i["accountName"])
    logger.info(f"Found accounts: {seen}")
    return seen


def latest_items_for_account(account: str, limit: int = 4) -> List[Dict[str, Any]]:
    items = table.query(KeyConditionExpression=Key("accountName").eq(account), ScanIndexForward=False, Limit=limit)["Items"]
    logger.info(f"{account}: fetched {len(items)} items")
    return items


def lambda_handler(event: Dict[str, Any], _ctx: Any) -> Dict[str, Any]:
    logger.info("weekly_news_recap start")
    summary: Dict[str, int] = {}
    for account in list_accounts():
        items = latest_items_for_account(account)
        if not items:
            continue
        image_keys: List[str] = []
        timestamp = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        for idx, item in enumerate(items):
            logger.info(f"Rendering item {idx} for {account}")
            img = render_item(item, account)
            key = f"weekly_recap/{account}/recap_{timestamp}_{idx:03d}.png"
            buf = io.BytesIO()
            img.save(buf, format="PNG", compress_level=3)
            buf.seek(0)
            logger.info(f"Uploading {key}")
            s3.upload_fileobj(buf, TARGET_BUCKET, key, ExtraArgs={"ContentType": "image/png"})
            image_keys.append(key)
        logger.info(f"Invoking notify_post for {account}")
        lambda_cl.invoke(FunctionName=NOTIFY_POST_ARN, InvocationType="Event", Payload=json.dumps({"accountName": account, "imageKeys": image_keys}).encode())
        summary[account] = len(image_keys)
    logger.info(f"weekly_news_recap complete: {summary}")
    return {"status": "complete", "accounts": summary}


if __name__ == "__main__":
    event = json.loads(os.environ.get("EVENT_JSON", "{}") or "{}")
    lambda_handler(event, None)
