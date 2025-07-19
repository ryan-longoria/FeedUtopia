import datetime
import io
import json
import logging
import os
import tempfile
from typing import Any, Dict, List, Set, Tuple

import boto3
import moviepy.video.fx as vfx
import numpy as np
from boto3.dynamodb.conditions import Key
from moviepy.video.VideoClip import ColorClip, ImageClip, TextClip
from moviepy.video.compositing.CompositeVideoClip import CompositeVideoClip
from moviepy.video.io.VideoFileClip import VideoFileClip
from PIL import Image, ImageColor, ImageDraw, ImageFont

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ─── Sizes ──────────────────────────────────────────────────
WIDTH, HEIGHT = 1080, 1350
VID_W, VID_H = WIDTH, HEIGHT
DEFAULT_VID_DURATION = 10  # seconds

# ─── Fonts, colours, artifacts ─────────────────────────────
TITLE_MAX, TITLE_MIN = 90, 60
DESC_MAX, DESC_MIN = 60, 30
HIGHLIGHT_COLOR = "#ec008c"
BASE_COLOR = "white"
GRADIENT_KEY = "artifacts/Black Gradient.png"
LOGO_KEY_GLOBAL = "artifacts/Logo.png"  # only used by cover
ROOT = os.path.dirname(__file__)
FONT_TITLE = os.path.join(ROOT, "ariblk.ttf")
FONT_DESC = os.path.join(ROOT, "Montserrat-Medium.ttf")

# ─── Env / AWS ──────────────────────────────────────────────
TARGET_BUCKET = os.environ["TARGET_BUCKET"]
NEWS_TABLE = os.environ["NEWS_TABLE"]
NOTIFY_POST_ARN = os.environ["NOTIFY_POST_FUNCTION_ARN"]

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(NEWS_TABLE)
s3 = boto3.client("s3")
lambda_cl = boto3.client("lambda")

# ═══════════════════════════════════════════════════════════
#                         HELPERS
# ═══════════════════════════════════════════════════════════
def logo_key_for(account: str) -> str:
    """Return account‑specific logo path, e.g. artifacts/animeutopia/logo.png"""
    return f"artifacts/{account.lower()}/logo.png"


def download_s3_file(bucket: str, key: str, local: str) -> bool:
    try:
        s3.download_file(bucket, key, local)
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("download %s failed: %s", key, exc)
        return False


def autosize(text: str, max_sz: int, min_sz: int, ideal: int) -> int:
    if not text:
        return min_sz
    if len(text) <= ideal:
        return max_sz
    factor = (max_sz - min_sz) / ideal
    size = max_sz - (len(text) - ideal) * factor
    return max(int(size), min_sz)


def Pillow_text_img(
    text: str,
    font_path: str,
    font_size: int,
    highlights: Set[str],
    max_width: int,
    space: int = 15,
) -> Image.Image:
    font = ImageFont.truetype(font_path, font_size)
    words = text.split()
    lines, cur, w_cur = [], [], 0
    for w in words:
        bb = font.getbbox(w)
        w_w = bb[2] - bb[0]
        adv = w_w if not cur else w_w + space
        if w_cur + adv <= max_width:
            cur.append((w, bb))
            w_cur += adv
        else:
            lines.append(cur)
            cur, w_cur = [(w, bb)], w_w
    if cur:
        lines.append(cur)

    rendered: List[Image.Image] = []
    for ln in lines:
        x_off, line_h, pieces = 0, 0, []
        for w, bb in ln:
            w_w, w_h = bb[2] - bb[0], bb[3] - bb[1]
            colour = HIGHLIGHT_COLOR if w.strip(",.!?;:").upper() in highlights else BASE_COLOR
            img = Image.new("RGBA", (w_w, w_h), (0, 0, 0, 0))
            ImageDraw.Draw(img).text((-bb[0], -bb[1]), w, font=font, fill=colour)
            pieces.append((img, x_off))
            x_off += w_w + space
            line_h = max(line_h, w_h)
        ln_img = Image.new("RGBA", (x_off - space, line_h), (0, 0, 0, 0))
        for img, xo in pieces:
            ln_img.paste(img, (xo, 0), img)
        rendered.append(ln_img)

    tot_h = sum(i.height for i in rendered) + 10 * (len(rendered) - 1)
    canvas = Image.new("RGBA", (max_width, tot_h), (0, 0, 0, 0))
    y = 0
    for img in rendered:
        canvas.paste(img, ((max_width - img.width) // 2, y), img)
        y += img.height + 10
    return canvas


def measure_pillow(word: str, font_path: str, size: int) -> int:
    return ImageFont.truetype(font_path, size).getbbox(word)[2]


# ═══════════════════════════════════════════════════════════
#                     PHOTO   →   PNG  (no logo)
# ═══════════════════════════════════════════════════════════
def render_photo(item: Dict[str, Any], account: str) -> Tuple[str, str]:
    bg_key = item.get("s3Key", "")
    local_bg = os.path.join(tempfile.gettempdir(), os.path.basename(bg_key))
    has_bg = download_s3_file(TARGET_BUCKET, bg_key, local_bg)

    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))
    if has_bg:
        with Image.open(local_bg).convert("RGBA") as im:
            scale = WIDTH / im.width
            nh = int(im.height * scale)
            im = im.resize((WIDTH, nh), Image.LANCZOS)
            if nh > HEIGHT:
                y0 = (nh - HEIGHT) // 2
                im = im.crop((0, y0, WIDTH, y0 + HEIGHT))
            canvas.paste(im, (0, 0))

    grad_local = os.path.join(tempfile.gettempdir(), "grad.png")
    if download_s3_file(TARGET_BUCKET, GRADIENT_KEY, grad_local):
        with Image.open(grad_local).convert("RGBA").resize((WIDTH, HEIGHT)) as g:
            canvas.alpha_composite(g)

    title = (item.get("title") or "").upper()
    subtitle = (item.get("subtitle") or "").upper()
    hl_t = {w.strip().upper() for w in (item.get("highlightWordsTitle") or "").split(",") if w.strip()}
    hl_s = {w.strip().upper() for w in (item.get("highlightWordsDescription") or "").split(",") if w.strip()}

    t_img = Pillow_text_img(title, FONT_TITLE, autosize(title, TITLE_MAX, TITLE_MIN, 30), hl_t, 1000)
    sub_img = (
        Pillow_text_img(subtitle, FONT_DESC, autosize(subtitle, DESC_MAX, DESC_MIN, 45), hl_s, 900)
        if subtitle else None
    )

    ly = HEIGHT - 100  # footer baseline (no logo)

    if sub_img:
        y_sub = ly - 50 - sub_img.height
        y_title = y_sub - 50 - t_img.height
    else:
        y_title = HEIGHT - 300 - t_img.height

    canvas.alpha_composite(t_img, ((WIDTH - t_img.width) // 2, y_title))
    if sub_img:
        canvas.alpha_composite(sub_img, ((WIDTH - sub_img.width) // 2, y_sub))

    buf = io.BytesIO()
    canvas.convert("RGB").save(buf, "PNG", compress_level=3)
    buf.seek(0)

    ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    key = f"weekly_recap/{account}/img_{ts}_{item['createdAt']}.png"
    s3.upload_fileobj(buf, TARGET_BUCKET, key, ExtraArgs={"ContentType": "image/png"})
    return key, "photo"


# ═══════════════════════════════════════════════════════════
#                      VIDEO  →  MP4/PNG  (no logo)
# ═══════════════════════════════════════════════════════════
def multi_coloured_clip(
    text: str,
    highlights: Set[str],
    font_path: str,
    font_size: int,
    max_width: int,
    duration: float,
) -> CompositeVideoClip:
    words = text.split()
    lines, cur, w_cur = [], [], 0
    for w in words:
        w_w = measure_pillow(w, font_path, font_size)
        adv = w_w if not cur else w_w + 15
        if w_cur + adv <= max_width:
            cur.append(w)
            w_cur += adv
        else:
            lines.append(cur)
            cur, w_cur = [w], w_w
    if cur:
        lines.append(cur)

    line_comps = []
    for ln in lines:
        x_off, parts = 0, []
        for w in ln:
            colour = HIGHLIGHT_COLOR if w.strip(",.!?;:").upper() in highlights else "white"
            w_w = measure_pillow(w, font_path, font_size)
            txt_clip = (
                TextClip(text=w, font=font_path, color=colour, font_size=font_size, method="label")
                .with_duration(duration)
                .with_position((x_off, 0))
            )
            x_off += w_w + 15
            parts.append(txt_clip)
        lw = max(x_off - 15, 1)
        lh = parts[0].h if parts else 1
        line_comps.append(CompositeVideoClip(parts, size=(lw, lh)).with_duration(duration))

    max_w = max((lc.w for lc in line_comps), default=1)
    y_cur, stacked = 0, []
    for lc in line_comps:
        stacked.append(lc.with_position(((max_w - lc.w) // 2, y_cur)))
        y_cur += lc.h + 10
    tot_h = max(y_cur - 10, 1)
    return CompositeVideoClip(stacked, size=(max_w, tot_h)).with_duration(duration)


def render_video(item: Dict[str, Any], account: str) -> Tuple[List[str], str]:
    bg_key = item.get("s3Key", "")
    local_bg = "/tmp/bg.mp4"
    if not download_s3_file(TARGET_BUCKET, bg_key, local_bg):
        logger.warning("video missing, fallback to static PNG")
        return [render_photo(item, account)[0]], "photo"

    raw_bg = VideoFileClip(local_bg, audio=False)
    dur = min(raw_bg.duration, DEFAULT_VID_DURATION)

    scale = VID_W / raw_bg.w
    new_h = int(raw_bg.h * scale)
    scaled = raw_bg.with_effects([vfx.Resize((VID_W, new_h))]).with_duration(dur)

    centre_offset = (VID_H - new_h) // 2
    y_offset = centre_offset - 150

    base = ColorClip((VID_W, VID_H), color=(0, 0, 0)).with_duration(dur)
    bg_clip = scaled.with_position((0, y_offset))
    composite: List = [base, bg_clip]

    grad_local = "/tmp/grad.png"
    if download_s3_file(TARGET_BUCKET, GRADIENT_KEY, grad_local):
        composite.append(ImageClip(grad_local).with_effects([vfx.Resize((VID_W, VID_H))]).with_duration(dur))

    title = (item.get("title") or "").upper()
    sub = (item.get("subtitle") or "").upper()
    hl_t = {w.strip().upper() for w in (item.get("highlightWordsTitle") or "").split(",") if w.strip()}
    hl_s = {w.strip().upper() for w in (item.get("highlightWordsDescription") or "").split(",") if w.strip()}

    title_img = Pillow_text_img(title, FONT_TITLE, autosize(title, 100, 75, 25), hl_t, 1000)
    t_clip = ImageClip(np.array(title_img)).with_duration(dur).with_position(("center", 25))
    composite.append(t_clip)

    if sub:
        sub_img = Pillow_text_img(sub, FONT_DESC, autosize(sub, 70, 30, 45), hl_s, 800)
        s_clip = (
            ImageClip(np.array(sub_img))
            .with_duration(dur)
            .with_position(("center", VID_H - 150 - sub_img.height))
        )
        composite.append(s_clip)

    final = CompositeVideoClip(composite, size=(VID_W, VID_H)).with_duration(dur)

    ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    basekey = f"weekly_recap/{account}/vid_{ts}_{item['createdAt']}"
    mp4_key, png_key = f"{basekey}.mp4", f"{basekey}.png"

    tmp_mp4 = "/tmp/out.mp4"
    final.write_videofile(
        tmp_mp4,
        fps=24,
        codec="libx264",
        audio=False,
        threads=2,
        ffmpeg_params=["-preset", "ultrafast"],
    )
    s3.upload_file(
        tmp_mp4,
        TARGET_BUCKET,
        mp4_key,
        ExtraArgs={"ContentType": "video/mp4", "ContentDisposition": 'attachment; filename="recap.mp4"'},
    )

    thumb = final.get_frame(0)
    buf = io.BytesIO()
    Image.fromarray(thumb).save(buf, "PNG", compress_level=2)
    buf.seek(0)
    s3.upload_fileobj(buf, TARGET_BUCKET, png_key, ExtraArgs={"ContentType": "image/png"})

    return [mp4_key, png_key], "video"


# ═══════════════════════════════════════════════════════════
#                      COVER  →  PNG  (with logo)
# ═══════════════════════════════════════════════════════════
def render_cover(items: List[Dict[str, Any]], account: str) -> str:
    if not items:
        return ""

    TOPIC_BY_ACCOUNT = {
        "animeutopia":   "ANIME",
        "wrestleutopia": "WRESTLING",
        "xputopia":      "GAMING",
        "cyberutopia":   "TECH",
        "critterutopia": "ANIMAL",
        "flicksutopia":  "FILM",
        "driftutopia":   "CAR/AUTOMOTIVE",
    }
    topic = TOPIC_BY_ACCOUNT.get(account.lower(), "")
    headline_words = ["TOP"]
    if topic:
        headline_words.append(topic)
    headline_words += ["NEWS", "OF", "THIS", "WEEK", "THAT", "YOU", "MAY", "HAVE", "MISSED"]
    headline = " ".join(headline_words).upper()
    subtitle, hl_head, hl_sub = "SWIPE", {"TOP", "NEWS"}, {"SWIPE"}
    if topic:
        hl_head.add(topic.upper())

    photo_item = next((itm for itm in items if (itm.get("backgroundType") or "photo").lower() == "photo"), None)
    bg_item = photo_item or items[0]
    bg_key, bg_type = bg_item.get("s3Key", ""), (bg_item.get("backgroundType") or "photo").lower()

    safe = "".join(c if c.isalnum() else "_" for c in account)[:32]
    tmp_photo, tmp_video = f"/tmp/{safe}_cover_bg.png", f"/tmp/{safe}_cover_bg.mp4"

    bg_ok = False
    if bg_type == "photo":
        bg_ok = download_s3_file(TARGET_BUCKET, bg_key, tmp_photo)
        bg_path = tmp_photo if bg_ok else None
    else:
        if download_s3_file(TARGET_BUCKET, bg_key, tmp_video):
            try:
                frame = VideoFileClip(tmp_video, audio=False).get_frame(0)
                Image.fromarray(frame).save(tmp_photo)
                bg_ok = True
            except Exception as exc:
                logger.warning("cover: failed video frame grab: %s", exc)
        bg_path = tmp_photo if bg_ok else None

    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))
    if bg_ok and bg_path:
        with Image.open(bg_path).convert("RGBA") as im:
            scale, nh = WIDTH / im.width, int(im.height * (WIDTH / im.width))
            im = im.resize((WIDTH, nh), Image.LANCZOS)
            if nh > HEIGHT:
                y0 = (nh - HEIGHT) // 2
                im = im.crop((0, y0, WIDTH, y0 + HEIGHT))
            canvas.paste(im, (0, 0))

    grad_local = os.path.join(tempfile.gettempdir(), "grad.png")
    if download_s3_file(TARGET_BUCKET, GRADIENT_KEY, grad_local):
        with Image.open(grad_local).convert("RGBA").resize((WIDTH, HEIGHT)) as g:
            canvas.alpha_composite(g)

    h_img = Pillow_text_img(headline, FONT_TITLE, autosize(headline, 110, 75, 35), hl_head, 1000)
    s_img = Pillow_text_img(subtitle, FONT_DESC, autosize(subtitle, 70, 30, 45), hl_sub, 600)
    y_sub, y_head = HEIGHT - 300 - s_img.height, HEIGHT - 300 - s_img.height - 50 - h_img.height
    canvas.alpha_composite(h_img, ((WIDTH - h_img.width) // 2, y_head))
    canvas.alpha_composite(s_img, ((WIDTH - s_img.width) // 2, y_sub))

    logo_local = os.path.join(tempfile.gettempdir(), "logo.png")
    logo_ok = download_s3_file(TARGET_BUCKET, logo_key_for(account), logo_local) or \
              download_s3_file(TARGET_BUCKET, LOGO_KEY_GLOBAL, logo_local)

    if logo_ok and os.path.exists(logo_local):
        try:
            logo = Image.open(logo_local).convert("RGBA")
            scale = 200 / logo.width
            logo = logo.resize((int(logo.width * scale), int(logo.height * scale)))
            lx, ly = WIDTH - logo.width - 50, HEIGHT - logo.height - 50
            stripe = Image.new("RGBA", (700, 4), ImageColor.getrgb(HIGHLIGHT_COLOR) + (255,))
            canvas.alpha_composite(stripe, (lx - 720, ly + logo.height // 2 - 2))
            canvas.alpha_composite(logo, (lx, ly))
        except Exception as exc:
            logger.warning("cover: logo render failed: %s", exc)

    buf = io.BytesIO()
    canvas.convert("RGB").save(buf, "PNG", compress_level=3)
    buf.seek(0)
    ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    key = f"weekly_recap/{account}/cover_{ts}.png"
    s3.upload_fileobj(buf, TARGET_BUCKET, key, ExtraArgs={"ContentType": "image/png"})
    return key


# ═══════════════════════════════════════════════════════════
#               DynamoDB  +  Teams notification
# ═══════════════════════════════════════════════════════════
def list_accounts() -> Set[str]:
    seen = set()
    paginator = table.meta.client.get_paginator("scan")
    for pg in paginator.paginate(TableName=NEWS_TABLE, ProjectionExpression="accountName"):
        seen.update(itm["accountName"] for itm in pg.get("Items", []))
    return seen


def latest_items(account: str, limit: int = 4) -> List[Dict[str, Any]]:
    return table.query(
        KeyConditionExpression=Key("accountName").eq(account),
        ScanIndexForward=False,
        Limit=limit,
    )["Items"]


def lambda_handler(event: Dict[str, Any], _ctx: Any) -> Dict[str, Any]:
    logger.info("weekly recap start")
    summary: Dict[str, int] = {}
    for acct in list_accounts():
        items = latest_items(acct)
        if not items:
            continue

        asset_keys: List[str] = []

        cover_key = render_cover(items, acct)
        if cover_key:
            asset_keys.append(cover_key)

        for itm in items:
            if (itm.get("backgroundType") or "photo").lower() == "video":
                keys, _ = render_video(itm, acct)
                asset_keys.extend(keys)
            else:
                k, _ = render_photo(itm, acct)
                asset_keys.append(k)

        if not asset_keys:
            continue

        lambda_cl.invoke(
            FunctionName=NOTIFY_POST_ARN,
            InvocationType="Event",
            Payload=json.dumps({"accountName": acct, "imageKeys": asset_keys}).encode(),
        )
        summary[acct] = len(asset_keys)

    logger.info("weekly recap complete: %s", summary)
    return {"status": "complete", "accounts": summary}


if __name__ == "__main__":
    raw_evt = os.environ.get("EVENT_JSON", "{}")
    try:
        evt = json.loads(raw_evt)
    except Exception:
        evt = {}
    lambda_handler(evt, None)
