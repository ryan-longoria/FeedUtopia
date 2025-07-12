import datetime, io, json, logging, os
from typing import Any, Dict, List, Set

import boto3
from boto3.dynamodb.conditions import Key
from PIL import Image, ImageColor, ImageDraw, ImageFont

# ──────────────────────────  CONFIG / CONSTANTS  ──────────────────────────
logger = logging.getLogger()
logger.setLevel(logging.INFO)

WIDTH, HEIGHT        = 1080, 1350
BACKGROUND_COLOR     = (0, 0, 0)
GRADIENT_KEY         = "artifacts/Black Gradient.png"

ROOT              = os.path.dirname(__file__)
FONT_PATH_TITLE   = os.path.join(ROOT, "ariblk.ttf")
FONT_PATH_DESC    = os.path.join(ROOT, "Montserrat-Medium.ttf")

TITLE_MAX, TITLE_MIN = 90, 60
DESC_MAX,  DESC_MIN  = 60, 30
HIGHLIGHT_COLOR      = "#ec008c"
BASE_COLOR           = "white"

TARGET_BUCKET   = os.environ["TARGET_BUCKET"]
NEWS_TABLE      = os.environ["NEWS_TABLE"]
NOTIFY_POST_ARN = os.environ["NOTIFY_POST_FUNCTION_ARN"]

dynamodb  = boto3.resource("dynamodb")
table     = dynamodb.Table(NEWS_TABLE)
s3        = boto3.client("s3")
lambda_cl = boto3.client("lambda")

# ──────────────────────────  HELPER FUNCTIONS  ──────────────────────────
def measure(word: str, font: str, size: int) -> int:
    return ImageFont.truetype(font, size).getbbox(word)[2]

def autosize(text: str, max_s: int, min_s: int, ideal: int) -> int:
    if len(text) <= ideal:
        return max_s
    scaled = max_s - (len(text) - ideal) * (max_s - min_s) / ideal
    return max(int(scaled), min_s)

def multiline_colored(
    txt: str, highlights: Set[str], font: str, fsize: int,
    max_w: int, space: int = 15, gap: int = 10
) -> Image.Image:
    words, lines, cur, width = txt.split(), [], [], 0
    for w in words:
        w_w = measure(w, font, fsize)
        add = w_w if not cur else w_w + space
        if width + add <= max_w:
            cur.append(w); width += add
        else:
            lines.append(cur); cur, width = [w], w_w
    if cur: lines.append(cur)

    rows: List[Image.Image] = []
    for line in lines:
        x, parts = 0, []
        for w in line:
            color = HIGHLIGHT_COLOR if w.strip(",.!?;:").upper() in highlights else BASE_COLOR
            fnt   = ImageFont.truetype(font, fsize)
            w_w   = fnt.getbbox(w)[2]; w_h = fnt.getbbox(w)[3]
            tile  = Image.new("RGBA", (w_w, w_h), (0, 0, 0, 0))
            ImageDraw.Draw(tile).text((0, 0), w, font=fnt, fill=color)
            parts.append((tile, x)); x += w_w + space
        row = Image.new("RGBA", (x - space, w_h), (0, 0, 0, 0))
        for tile, xoff in parts:
            row.paste(tile, (xoff, 0), tile)
        rows.append(row)

    tot_h = sum(r.height for r in rows) + gap * (len(rows) - 1)
    canvas = Image.new("RGBA", (max_w, tot_h), (0, 0, 0, 0))
    y = 0
    for r in rows:
        canvas.paste(r, ((max_w - r.width)//2, y), r)
        y += r.height + gap
    return canvas

# ── S3 helpers ─────────────────────────────────────────────────────────────
def dl(key: str, dest: str) -> bool:
    try:
        s3.download_file(TARGET_BUCKET, key, dest)
        return True
    except Exception as exc:
        logger.warning("Download %s failed: %s", key, exc)
        return False

def fetch_gradient() -> Image.Image | None:
    tmp = "/tmp/gradient.png"
    return (
        Image.open(tmp).convert("RGBA").resize((WIDTH, HEIGHT))
        if dl(GRADIENT_KEY, tmp) else None
    )

def fetch_logo(account: str) -> Image.Image | None:
    key = f"artifacts/{account.lower()}/logo.png"
    tmp = "/tmp/logo.png"
    if not dl(key, tmp):
        logger.warning("Logo not found for %s", account)
        return None
    logo = Image.open(tmp).convert("RGBA")
    scale = 200 / logo.width
    return logo.resize((int(logo.width * scale), int(logo.height * scale)))

def fetch_background(bucket: str, bg_type: str, key: str) -> Image.Image | None:
    if not key or bg_type.lower() == "video":
        return None
    tmp = "/tmp/bg.jpg"
    try:
        s3.download_file(bucket, key, tmp)
        return Image.open(tmp).convert("RGBA").resize((WIDTH, HEIGHT))
    except Exception as exc:
        logger.warning("Download %s/%s failed: %s", bucket, key, exc)
        return None

# ──────────────────────────  RENDER ONE ITEM  ────────────────────────────
def render_item(account: str, item: Dict[str, Any]) -> Image.Image:
    bg = fetch_background(
        TARGET_BUCKET,
        item.get("backgroundType", "image"),
        item.get("s3Key", ""),
    )

    canvas = Image.new("RGBA", (WIDTH, HEIGHT), BACKGROUND_COLOR)
    if bg:
        canvas.paste(bg, (0, 0))

    if (grad := fetch_gradient()):
        canvas.alpha_composite(grad)

    title    = item["title"].upper()
    subtitle = (item.get("subtitle") or "").upper()

    hl_title = {w.strip().upper() for w in (item.get("highlightWordsTitle") or "").split(",") if w.strip()}
    hl_sub   = {w.strip().upper() for w in (item.get("highlightWordsDescription") or "").split(",") if w.strip()}

    # title
    t_size = autosize(title, TITLE_MAX, TITLE_MIN, 30)
    t_img  = multiline_colored(title, hl_title, FONT_PATH_TITLE, t_size, 1000)
    canvas.alpha_composite(t_img, ((WIDTH - t_img.width)//2, 275))

    # subtitle
    if subtitle:
        d_size = autosize(subtitle, DESC_MAX, DESC_MIN, 45)
        d_img  = multiline_colored(subtitle, hl_sub, FONT_PATH_DESC, d_size, 900)
        canvas.alpha_composite(
            d_img,
            ((WIDTH - d_img.width)//2, HEIGHT - 300 - d_img.height)
        )

    # logo + pink line
    if (logo := fetch_logo(account)):
        lx, ly = WIDTH - logo.width - 50, HEIGHT - logo.height - 100
        stripe = Image.new(
            "RGBA", (700, 4), ImageColor.getrgb(HIGHLIGHT_COLOR) + (255,)
        )
        canvas.alpha_composite(stripe, (lx - 720, ly + logo.height//2 - 2))
        canvas.alpha_composite(logo, (lx, ly))

    return canvas.convert("RGB")

# ──────────────────────────  DYNAMODB HELPERS  ───────────────────────────
def list_accounts() -> Set[str]:
    seen: Set[str] = set()
    for page in table.meta.client.get_paginator("scan").paginate(
        TableName=NEWS_TABLE, ProjectionExpression="accountName"
    ):
        for it in page.get("Items", []):
            seen.add(it["accountName"])
    return seen

def latest_items_for(account: str, limit: int = 4) -> List[Dict[str, Any]]:
    return table.query(
        KeyConditionExpression=Key("accountName").eq(account),
        ScanIndexForward=False,
        Limit=limit,
    )["Items"]

# ──────────────────────────  LAMBDA ENTRY  ───────────────────────────────
def lambda_handler(event: Dict[str, Any], _ctx: Any) -> Dict[str, Any]:
    logger.info("weekly_news_recap start")

    accounts = list_accounts()
    logger.info("Found %d account(s) with NEWS posts", len(accounts))

    summary: Dict[str, int] = {}

    for account in accounts:
        items = latest_items_for(account)
        if not items:
            continue

        image_keys: List[str] = []
        ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")

        for idx, item in enumerate(items):
            img = render_item(account, item)
            key = f"weekly_recap/{account}/recap_{ts}_{idx:03d}.png"

            buf = io.BytesIO()
            img.save(buf, format="PNG", compress_level=3)
            buf.seek(0)
            s3.upload_fileobj(
                buf, TARGET_BUCKET, key,
                ExtraArgs={"ContentType": "image/png"}
            )
            image_keys.append(key)
            logger.info("Uploaded %s", key)

        lambda_cl.invoke(
            FunctionName=NOTIFY_POST_ARN,
            InvocationType="Event",
            Payload=json.dumps(
                {"accountName": account, "imageKeys": image_keys}
            ).encode(),
        )
        summary[account] = len(image_keys)
        logger.info("Invoked notify_post for %s with %d thumbnail(s)",
                    account, len(image_keys))

    return {"status": "complete", "accounts": summary}