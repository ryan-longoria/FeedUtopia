import datetime, io, json, logging, os, tempfile
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

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(message)s",
    level=logging.INFO,
)

# ── Visual constants ─────────────────────────────────────────────────────────
WIDTH, HEIGHT = 1080, 1350                      # final canvas size
TITLE_MAX, TITLE_MIN = 90, 60
DESC_MAX,  DESC_MIN  = 60, 30
HIGHLIGHT_COLOR = "#ec008c"
BASE_COLOR      = "white"

GRADIENT_KEY = "artifacts/Black Gradient.png"   # shared
ROOT = os.path.dirname(__file__)
FONT_PATH_TITLE = os.path.join(ROOT, "ariblk.ttf")
FONT_PATH_DESC  = os.path.join(ROOT, "Montserrat-Medium.ttf")

# ── Environment / AWS clients ────────────────────────────────────────────────
TARGET_BUCKET   = os.environ["TARGET_BUCKET"]
NEWS_TABLE      = os.environ["NEWS_TABLE"]
NOTIFY_POST_ARN = os.environ["NOTIFY_POST_FUNCTION_ARN"]

dynamodb  = boto3.resource("dynamodb")
table     = dynamodb.Table(NEWS_TABLE)
s3        = boto3.client("s3")
lambda_cl = boto3.client("lambda")

# ── Utility helpers ──────────────────────────────────────────────────────────
def measure(word: str, font: ImageFont.FreeTypeFont) -> int:
    return font.getbbox(word)[2]

def autosize(text: str, max_size: int, min_size: int, ideal: int) -> int:
    if len(text) <= ideal:
        return max_size
    size = max_size - (len(text) - ideal) * (max_size - min_size) / ideal
    return max(int(size), min_size)

def multiline_colored(text: str, highlights: Set[str],
                      font_path: str, font_size: int,
                      max_width: int, space: int = 15) -> Image.Image:
    """Return a RGBA image of wrapped text with highlighted words."""
    font = ImageFont.truetype(font_path, font_size)
    words, lines, cur, cur_w = text.split(), [], [], 0
    for w in words:
        w_w = measure(w, font)
        add = w_w if not cur else w_w + space
        if cur_w + add <= max_width:
            cur.append(w); cur_w += add
        else:
            lines.append(cur); cur, cur_w = [w], w_w
    if cur: lines.append(cur)

    rendered: List[Image.Image] = []
    for ln in lines:
        x, pieces = 0, []
        for w in ln:
            color = HIGHLIGHT_COLOR if w.strip(",.!?;:").upper() in highlights else BASE_COLOR
            img = Image.new("RGBA", font.getbbox(w)[2:], (0, 0, 0, 0))
            ImageDraw.Draw(img).text((0, 0), w, font=font, fill=color)
            pieces.append((img, x)); x += img.width + space
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
    return canvas

def download_to_tmp(key: str) -> str | None:
    """Download S3 object to /tmp and return its local path (or None)."""
    local = os.path.join(tempfile.gettempdir(), os.path.basename(key))
    try:
        s3.download_file(TARGET_BUCKET, key, local)
        return local
    except Exception as exc:
        logger.warning("Download %s failed: %s", key, exc)
        return None

# ── Background / Logo helpers ────────────────────────────────────────────────
def fetch_gradient() -> Image.Image | None:
    p = download_to_tmp(GRADIENT_KEY)
    return Image.open(p).convert("RGBA").resize((WIDTH, HEIGHT)) if p else None

def fetch_logo(account: str) -> Image.Image | None:
    key = f"artifacts/{account.lower()}/logo.png"
    p = download_to_tmp(key)
    if not p:
        return None
    logo = Image.open(p).convert("RGBA")
    scale = 200 / logo.width
    return logo.resize((int(logo.width * scale), int(logo.height * scale)))

def fetch_background(bg_type: str, key: str) -> Image.Image | None:
    """Return a 1080-wide image, center-cropped (no stretch)."""
    if not key:
        return None

    local = download_to_tmp(key)
    if not local:
        return None

    # ── VIDEO ────────────────────────────────────────────────────────────────
    if bg_type.lower() == "video":
        if VideoFileClip is None:
            logger.warning("MoviePy not available – skipping video background")
            return None
        try:
            with VideoFileClip(local) as clip:
                frame_time = clip.duration / 2
                frame = clip.get_frame(frame_time)  # numpy array
        except Exception as exc:
            logger.warning("Failed video frame extract: %s", exc)
            return None
        img = Image.fromarray(frame).convert("RGBA")
    # ── IMAGE ────────────────────────────────────────────────────────────────
    else:
        img = Image.open(local).convert("RGBA")

    # Fit width to 1080, maintain aspect
    scale = WIDTH / img.width
    new_h = int(img.height * scale)
    img = img.resize((WIDTH, new_h), Image.LANCZOS)

    # Center-crop/tighten to HEIGHT
    if new_h > HEIGHT:
        y0 = (new_h - HEIGHT) // 2
        img = img.crop((0, y0, WIDTH, y0 + HEIGHT))
    return img

# ── Core rendering ───────────────────────────────────────────────────────────
def render_item(item: Dict[str, Any], account: str) -> Image.Image:
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))

    # background
    bg = fetch_background(item.get("backgroundType", "image"),
                          item.get("s3Key", ""))
    if bg:
        canvas.paste(bg, (0, 0))

    # gradient overlay
    if (grad := fetch_gradient()):
        canvas.alpha_composite(grad)

    # title / subtitle
    title     = (item["title"] or "").upper()
    subtitle  = (item.get("subtitle") or "").upper()
    hl_title  = {
        w.strip().upper()
        for w in (item.get("highlightWordsTitle") or "").split(",") if w.strip()
    }
    hl_sub    = {
        w.strip().upper()
        for w in (item.get("highlightWordsDescription") or "").split(",") if w.strip()
    }

    # autosize fonts
    t_font = autosize(title,  TITLE_MAX, TITLE_MIN, 30)
    s_font = autosize(subtitle, DESC_MAX,  DESC_MIN, 45)

    # render text images
    t_img = multiline_colored(title, hl_title, FONT_PATH_TITLE, t_font, 1000)
    sub_img = None
    if subtitle:
        sub_img = multiline_colored(subtitle, hl_sub, FONT_PATH_DESC, s_font, 900)

    # dynamic layout: stack title + subtitle for image backgrounds
    bg_type = item.get("backgroundType", "image").lower()
    if bg_type == "image" and sub_img is not None:
        gap = 50
        total_h = t_img.height + sub_img.height + gap
        y_start = (HEIGHT - total_h) // 2
        y_title = y_start
        y_sub   = y_title + t_img.height + gap
    else:
        # original fixed positions for video (or no subtitle)
        y_title = 260
        y_sub = HEIGHT - 335 - sub_img.height if sub_img is not None else None

    # composite title
    canvas.alpha_composite(t_img, ((WIDTH - t_img.width) // 2, y_title))
    # composite subtitle
    if sub_img is not None and y_sub is not None:
        canvas.alpha_composite(sub_img, ((WIDTH - sub_img.width) // 2, y_sub))

    # logo + stripe (50 px lower)
    if (logo := fetch_logo(account)):
        lx = WIDTH - logo.width - 50
        ly = HEIGHT - logo.height - 50
        stripe = Image.new("RGBA", (700, 4), ImageColor.getrgb(HIGHLIGHT_COLOR) + (255,))
        canvas.alpha_composite(stripe, (lx - 720, ly + logo.height//2 - 2))
        canvas.alpha_composite(logo,   (lx, ly))

    return canvas.convert("RGB")

# ── DynamoDB utilities ───────────────────────────────────────────────────────
def list_accounts() -> Set[str]:
    seen: Set[str] = set()
    paginator = table.meta.client.get_paginator("scan")
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
        Limit=limit
    )["Items"]

# ── Lambda entry-point ───────────────────────────────────────────────────────
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
            img = render_item(item, account)
            key = f"weekly_recap/{account}/recap_{timestamp}_{idx:03d}.png"
            buf = io.BytesIO()
            img.save(buf, format="PNG", compress_level=3)
            buf.seek(0)
            s3.upload_fileobj(buf, TARGET_BUCKET, key,
                              ExtraArgs={"ContentType": "image/png"})
            image_keys.append(key)
            logger.info("Uploaded %s", key)

        lambda_cl.invoke(
            FunctionName=NOTIFY_POST_ARN,
            InvocationType="Event",
            Payload=json.dumps({
                "accountName": account,
                "imageKeys": image_keys
            }).encode()
        )
        summary[account] = len(image_keys)
        logger.info("Notify → %s (%d thumbnails)", account, len(image_keys))

    return {"status": "complete", "accounts": summary}


if __name__ == "__main__":
    import json, os
    event = json.loads(os.environ.get("EVENT_JSON", "{}") or "{}")
    lambda_handler(event, None)
