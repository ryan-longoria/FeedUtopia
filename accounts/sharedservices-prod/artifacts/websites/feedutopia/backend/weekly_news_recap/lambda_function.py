import datetime, io, json, logging, os, tempfile
from typing import Any, Dict, List, Set, Tuple

import boto3, moviepy.video.fx as vfx, numpy as np
from boto3.dynamodb.conditions import Key
from moviepy.video.VideoClip import ColorClip, ImageClip, TextClip
from moviepy.video.compositing.CompositeVideoClip import CompositeVideoClip
from moviepy.video.io.VideoFileClip import VideoFileClip
from PIL import Image, ImageColor, ImageDraw, ImageFont

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ─── Canvas sizes ───────────────────────────
WIDTH, HEIGHT = 1080, 1350
VID_W, VID_H = WIDTH, HEIGHT
DEFAULT_VID_DURATION = 10

# ─── Fonts & colours ────────────────────────
TITLE_MAX, TITLE_MIN = 90, 60
DESC_MAX,  DESC_MIN  = 60, 30
HIGHLIGHT_COLOR = "#ec008c"
BASE_COLOR      = "white"
GRADIENT_KEY    = "artifacts/Black Gradient.png"   # photo & cover only
LOGO_KEY_GLOBAL = "artifacts/Logo.png"             # cover only

ROOT       = os.path.dirname(__file__)
FONT_TITLE = os.path.join(ROOT, "ariblk.ttf")
FONT_DESC  = os.path.join(ROOT, "Montserrat-Medium.ttf")

# ─── Env / AWS ──────────────────────────────
TARGET_BUCKET     = os.environ["TARGET_BUCKET"]
NEWS_TABLE        = os.environ["NEWS_TABLE"]
NOTIFY_POST_ARN   = os.environ["NOTIFY_POST_FUNCTION_ARN"]

dynamodb  = boto3.resource("dynamodb")
table     = dynamodb.Table(NEWS_TABLE)
s3        = boto3.client("s3")
lambda_cl = boto3.client("lambda")

# ═══════════════════════════════════════════
#                  HELPERS
# ═══════════════════════════════════════════
def logo_key_for(account: str) -> str:
    return f"artifacts/{account.lower()}/logo.png"

def download_s3_file(bucket: str, key: str, local: str) -> bool:
    try:
        s3.download_file(bucket, key, local)
        return True
    except Exception as exc:
        logger.warning("download %s failed: %s", key, exc)
        return False

def autosize(text: str, max_sz: int, min_sz: int, ideal: int) -> int:
    if not text:
        return min_sz
    if len(text) <= ideal:
        return max_sz
    factor = (max_sz - min_sz) / ideal
    size   = max_sz - (len(text) - ideal) * factor
    return max(int(size), min_sz)

def Pillow_text_img(
    text: str, font_path: str, font_size: int,
    highlights: Set[str], max_width: int, space: int = 15
) -> Image.Image:
    font = ImageFont.truetype(font_path, font_size)
    words, lines, cur, w_cur = text.split(), [], [], 0
    for w in words:
        bb, w_w = font.getbbox(w), font.getbbox(w)[2]
        adv = w_w if not cur else w_w + space
        if w_cur + adv <= max_width:
            cur.append((w, bb)); w_cur += adv
        else:
            lines.append(cur); cur, w_cur = [(w, bb)], w_w
    if cur: lines.append(cur)

    rendered: List[Image.Image] = []
    for ln in lines:
        x_off = line_h = 0; pieces = []
        for w, bb in ln:
            w_w, w_h = bb[2] - bb[0], bb[3] - bb[1]
            colour   = HIGHLIGHT_COLOR if w.strip(",.!?;:").upper() in highlights else BASE_COLOR
            img      = Image.new("RGBA", (w_w, w_h), (0, 0, 0, 0))
            ImageDraw.Draw(img).text((-bb[0], -bb[1]), w, font=font, fill=colour)
            pieces.append((img, x_off)); x_off += w_w + space; line_h = max(line_h, w_h)
        ln_img = Image.new("RGBA", (x_off - space, line_h), (0, 0, 0, 0))
        for img, xo in pieces: ln_img.paste(img, (xo, 0), img)
        rendered.append(ln_img)

    tot_h  = sum(i.height for i in rendered) + 10 * (len(rendered) - 1)
    canvas = Image.new("RGBA", (max_width, tot_h), (0, 0, 0, 0))
    y = 0
    for img in rendered:
        canvas.paste(img, ((max_width - img.width) // 2, y), img)
        y += img.height + 10
    return canvas

def measure_pillow(word: str, font_path: str, size: int) -> int:
    return ImageFont.truetype(font_path, size).getbbox(word)[2]

# ═══════════════════════════════════════════
#                PHOTO  → PNG  (no logo)
# ═══════════════════════════════════════════
def render_photo(item: Dict[str, Any], account: str) -> Tuple[str, str]:
    bg_key   = item.get("s3Key", "")
    local_bg = os.path.join(tempfile.gettempdir(), os.path.basename(bg_key))
    has_bg   = download_s3_file(TARGET_BUCKET, bg_key, local_bg)

    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))
    if has_bg:
        with Image.open(local_bg).convert("RGBA") as im:
            im = im.resize((WIDTH, int(im.height * WIDTH / im.width)), Image.LANCZOS)
            if im.height > HEIGHT:  # keep top, crop bottom
                im = im.crop((0, 0, WIDTH, HEIGHT))
            canvas.paste(im, (0, 0))

    grad_local = os.path.join(tempfile.gettempdir(), "grad.png")
    if download_s3_file(TARGET_BUCKET, GRADIENT_KEY, grad_local):
        with Image.open(grad_local).convert("RGBA").resize((WIDTH, HEIGHT)) as g:
            canvas.alpha_composite(g)

    title, subtitle = (item.get("title") or "").upper(), (item.get("subtitle") or "").upper()
    hl_t = {w.strip().upper() for w in (item.get("highlightWordsTitle") or "").split(",") if w.strip()}
    hl_s = {w.strip().upper() for w in (item.get("highlightWordsDescription") or "").split(",") if w.strip()}

    t_img   = Pillow_text_img(title, FONT_TITLE, autosize(title, TITLE_MAX, TITLE_MIN, 30), hl_t, 1000)
    sub_img = Pillow_text_img(subtitle, FONT_DESC, autosize(subtitle, DESC_MAX, DESC_MIN, 45), hl_s, 900) if subtitle else None

    y_title = HEIGHT - 300 - t_img.height if not sub_img else (HEIGHT - 100 - 50 - sub_img.height - 50 - t_img.height)
    canvas.alpha_composite(t_img, ((WIDTH - t_img.width) // 2, y_title))
    if sub_img:
        y_sub = HEIGHT - 100 - 50 - sub_img.height
        canvas.alpha_composite(sub_img, ((WIDTH - sub_img.width) // 2, y_sub))

    buf = io.BytesIO(); canvas.convert("RGB").save(buf, "PNG", compress_level=3); buf.seek(0)
    ts  = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    key = f"weekly_recap/{account}/img_{ts}_{item['createdAt']}.png"
    s3.upload_fileobj(buf, TARGET_BUCKET, key, ExtraArgs={"ContentType": "image/png"})
    return key, "photo"

# ═══════════════════════════════════════════
#                VIDEO  → MP4/PNG  (no logo, no gradient)
# ═══════════════════════════════════════════
def render_video(item: Dict[str, Any], account: str) -> Tuple[List[str], str]:
    bg_key, local_bg = item.get("s3Key", ""), "/tmp/bg.mp4"
    if not download_s3_file(TARGET_BUCKET, bg_key, local_bg):
        logger.warning("video missing, fallback to static PNG")
        return [render_photo(item, account)[0]], "photo"

    raw_bg = VideoFileClip(local_bg, audio=False)
    dur    = min(raw_bg.duration, DEFAULT_VID_DURATION)
    scale  = VID_W / raw_bg.w
    new_h  = int(raw_bg.h * scale)
    scaled = raw_bg.with_effects([vfx.Resize((VID_W, new_h))]).with_duration(dur)

    y_offset = (0 if new_h > VID_H else (VID_H - new_h) // 2) + 50
    base     = ColorClip((VID_W, VID_H), color=(0, 0, 0)).with_duration(dur)
    composite: List = [base, scaled.with_position((0, y_offset))]

    # → No gradient overlay for video backgrounds ←

    title, sub = (item.get("title") or "").upper(), (item.get("subtitle") or "").upper()
    hl_t = {w.strip().upper() for w in (item.get("highlightWordsTitle") or "").split(",") if w.strip()}
    hl_s = {w.strip().upper() for w in (item.get("highlightWordsDescription") or "").split(",") if w.strip()}

    t_clip = ImageClip(np.array(Pillow_text_img(title, FONT_TITLE, autosize(title, 100, 75, 25), hl_t, 1000))).with_duration(dur).with_position(("center", 25))
    composite.append(t_clip)

    if sub:
        sub_img = Pillow_text_img(sub, FONT_DESC, autosize(sub, 70, 30, 45), hl_s, 800)
        composite.append(ImageClip(np.array(sub_img)).with_duration(dur).with_position(("center", VID_H - 150 - sub_img.height)))

    final = CompositeVideoClip(composite, size=(VID_W, VID_H)).with_duration(dur)

    ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    basekey = f"weekly_recap/{account}/vid_{ts}_{item['createdAt']}"
    mp4_key, png_key = f"{basekey}.mp4", f"{basekey}.png"

    tmp_mp4 = "/tmp/out.mp4"
    final.write_videofile(tmp_mp4, fps=24, codec="libx264", audio=False, threads=2, ffmpeg_params=["-preset", "ultrafast"])
    s3.upload_file(tmp_mp4, TARGET_BUCKET, mp4_key, ExtraArgs={"ContentType": "video/mp4", "ContentDisposition": 'attachment; filename="recap.mp4"'})

    buf = io.BytesIO(); Image.fromarray(final.get_frame(0)).save(buf, "PNG", compress_level=2); buf.seek(0)
    s3.upload_fileobj(buf, TARGET_BUCKET, png_key, ExtraArgs={"ContentType": "image/png"})
    return [mp4_key, png_key], "video"

# ═══════════════════════════════════════════
#                COVER  → PNG (with logo)
# ═══════════════════════════════════════════
def render_cover(items: List[Dict[str, Any]], account: str) -> str:
    if not items: return ""

    TOPIC = {
        "animeutopia": "ANIME", "wrestleutopia": "WRESTLING", "xputopia": "GAMING",
        "cyberutopia": "TECH",  "critterutopia": "ANIMAL",    "flicksutopia": "FILM",
        "driftutopia": "CAR/AUTOMOTIVE",
    }.get(account.lower(), "")
    headline_words = ["TOP"] + ([TOPIC] if TOPIC else []) + ["NEWS", "OF", "THIS", "WEEK", "THAT", "YOU", "MAY", "HAVE", "MISSED"]
    headline, subtitle = " ".join(headline_words).upper(), "SWIPE"
    hl_head, hl_sub = {"TOP", "NEWS", *( [TOPIC.upper()] if TOPIC else [] )}, {"SWIPE"}

    bg_item = next((i for i in items if (i.get("backgroundType") or "photo").lower() == "photo"), items[0])
    bg_key, bg_type = bg_item["s3Key"], (bg_item.get("backgroundType") or "photo").lower()

    safe = "".join(c if c.isalnum() else "_" for c in account)[:32]
    tmp_photo, tmp_video = f"/tmp/{safe}_cover_bg.png", f"/tmp/{safe}_cover_bg.mp4"

    if bg_type == "photo":
        download_s3_file(TARGET_BUCKET, bg_key, tmp_photo)
    else:
        if download_s3_file(TARGET_BUCKET, bg_key, tmp_video):
            try: Image.fromarray(VideoFileClip(tmp_video, audio=False).get_frame(0)).save(tmp_photo)
            except Exception as exc: logger.warning("cover frame grab: %s", exc)

    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))
    if os.path.exists(tmp_photo):
        with Image.open(tmp_photo).convert("RGBA") as im:
            im = im.resize((WIDTH, int(im.height * WIDTH / im.width)), Image.LANCZOS)
            if im.height > HEIGHT: im = im.crop((0, 0, WIDTH, HEIGHT))  # top‑kept crop
            canvas.paste(im, (0, 0))

    grad_local = os.path.join(tempfile.gettempdir(), "grad.png")
    if download_s3_file(TARGET_BUCKET, GRADIENT_KEY, grad_local):
        with Image.open(grad_local).convert("RGBA").resize((WIDTH, HEIGHT)) as g: canvas.alpha_composite(g)

    h_img = Pillow_text_img(headline, FONT_TITLE, autosize(headline, 110, 75, 35), hl_head, 1000)
    s_img = Pillow_text_img(subtitle, FONT_DESC, autosize(subtitle, 70, 30, 45), hl_sub, 600)
    y_sub, y_head = HEIGHT - 300 - s_img.height, HEIGHT - 300 - s_img.height - 50 - h_img.height
    canvas.alpha_composite(h_img, ((WIDTH - h_img.width) // 2, y_head))
    canvas.alpha_composite(s_img, ((WIDTH - s_img.width) // 2, y_sub))

    logo_local = os.path.join(tempfile.gettempdir(), "logo.png")
    if download_s3_file(TARGET_BUCKET, logo_key_for(account), logo_local) or download_s3_file(TARGET_BUCKET, LOGO_KEY_GLOBAL, logo_local):
        try:
            logo = Image.open(logo_local).convert("RGBA")
            logo = logo.resize((200, int(200 * logo.height / logo.width)))
            lx, ly = WIDTH - logo.width - 50, HEIGHT - logo.height - 50
            stripe = Image.new("RGBA", (700, 4), ImageColor.getrgb(HIGHLIGHT_COLOR) + (255,))
            canvas.alpha_composite(stripe, (lx - 720, ly + logo.height // 2 - 2))
            canvas.alpha_composite(logo, (lx, ly))
        except Exception as exc: logger.warning("cover logo: %s", exc)

    buf = io.BytesIO(); canvas.convert("RGB").save(buf, "PNG", compress_level=3); buf.seek(0)
    ts  = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    key = f"weekly_recap/{account}/cover_{ts}.png"
    s3.upload_fileobj(buf, TARGET_BUCKET, key, ExtraArgs={"ContentType": "image/png"})
    return key

# ═══════════════════════════════════════════════════════════
#             DynamoDB + Teams notifier
# ═══════════════════════════════════════════════════════════
def list_accounts() -> Set[str]:
    seen, paginator = set(), table.meta.client.get_paginator("scan")
    for pg in paginator.paginate(TableName=NEWS_TABLE, ProjectionExpression="accountName"):
        seen.update(i["accountName"] for i in pg.get("Items", []))
    return seen

def latest_items(account: str, limit: int = 4) -> List[Dict[str, Any]]:
    return table.query(KeyConditionExpression=Key("accountName").eq(account), ScanIndexForward=False, Limit=limit)["Items"]

def lambda_handler(event: Dict[str, Any], _ctx: Any) -> Dict[str, Any]:
    summary: Dict[str, int] = {}; logger.info("weekly recap start")
    for acct in list_accounts():
        items = latest_items(acct);  asset_keys: List[str] = []
        if not items: continue

        asset_keys.append(render_cover(items, acct))
        for itm in items:
            if (itm.get("backgroundType") or "photo").lower() == "video":
                asset_keys.extend(render_video(itm, acct)[0])
            else:
                asset_keys.append(render_photo(itm, acct)[0])

        lambda_cl.invoke(FunctionName=NOTIFY_POST_ARN, InvocationType="Event", Payload=json.dumps({"accountName": acct, "imageKeys": asset_keys}).encode())
        summary[acct] = len(asset_keys)

    logger.info("weekly recap complete: %s", summary)
    return {"status": "complete", "accounts": summary}

if __name__ == "__main__":
    raw_evt = os.environ.get("EVENT_JSON", "{}")
    lambda_handler(json.loads(raw_evt), None)
