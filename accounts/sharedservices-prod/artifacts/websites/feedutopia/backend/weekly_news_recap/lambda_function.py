# weekly_news_recap/lambda_function.py
# ─────────────────────────────────────────────────────────────
import datetime, io, json, logging, os, sys, tempfile
from typing import Any, Dict, List, Optional, Set, Tuple

import boto3
import moviepy.video.fx as vfx
import requests
from boto3.dynamodb.conditions import Key
from moviepy.video.VideoClip import ColorClip, ImageClip, TextClip
from moviepy.video.compositing.CompositeVideoClip import CompositeVideoClip
from moviepy.video.io.VideoFileClip import VideoFileClip
from PIL import Image, ImageColor, ImageDraw, ImageFont

# ─── Logging ─────────────────────────────────────────────────────────────
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ─── Constants ───────────────────────────────────────────────────────────
WIDTH, HEIGHT = 1080, 1350                   # PNG output size (photos)
VID_W, VID_H  = 1080, 1920                   # MP4 output size   (videos)
DEFAULT_VID_DURATION = 10                    # seconds
TITLE_MAX, TITLE_MIN = 90, 60
DESC_MAX,  DESC_MIN  = 60, 30
HIGHLIGHT_COLOR = "#ec008c"
BASE_COLOR      = "white"
GRADIENT_KEY    = "artifacts/Black Gradient.png"
LOGO_KEY        = "artifacts/Logo.png"
ROOT = os.path.dirname(__file__)
FONT_TITLE = os.path.join(ROOT, "ariblk.ttf")
FONT_DESC  = os.path.join(ROOT, "Montserrat-Medium.ttf")

TARGET_BUCKET   = os.environ["TARGET_BUCKET"]
NEWS_TABLE      = os.environ["NEWS_TABLE"]
NOTIFY_POST_ARN = os.environ["NOTIFY_POST_FUNCTION_ARN"]

# ─── AWS clients ─────────────────────────────────────────────────────────
dynamodb  = boto3.resource("dynamodb")
table     = dynamodb.Table(NEWS_TABLE)
s3        = boto3.client("s3")
lambda_cl = boto3.client("lambda")

# ─── Utility helpers (shared by PNG & MP4 paths) ─────────────────────────
def download_s3_file(bucket: str, key: str, local: str) -> bool:
    try:
        s3.download_file(bucket, key, local)
        return True
    except Exception as exc:                   # noqa: BLE001
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
    """Generate a RGBA image (no background) with colour‑highlighted words."""
    font  = ImageFont.truetype(font_path, font_size)
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
            lines.append(cur); cur, w_cur = [(w, bb)], w_w
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


# ─── PNG renderer (photos) ───────────────────────────────────────────────
def render_photo(item: Dict[str, Any], account: str) -> Tuple[bytes, str]:
    """Return PNG bytes & S3 key."""
    bg_key   = item.get("s3Key", "")
    local_bg = os.path.join(tempfile.gettempdir(), os.path.basename(bg_key))
    has_bg   = download_s3_file(TARGET_BUCKET, bg_key, local_bg)
    canvas   = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))

    if has_bg:
        with Image.open(local_bg).convert("RGBA") as im:
            scale = WIDTH / im.width
            nh    = int(im.height * scale)
            im    = im.resize((WIDTH, nh), Image.LANCZOS)
            if nh > HEIGHT:
                y0 = (nh - HEIGHT) // 2
                im = im.crop((0, y0, WIDTH, y0 + HEIGHT))
            canvas.paste(im, (0, 0))

    # gradient
    grad_local = os.path.join(tempfile.gettempdir(), "grad.png")
    if download_s3_file(TARGET_BUCKET, GRADIENT_KEY, grad_local):
        with Image.open(grad_local).convert("RGBA").resize((WIDTH, HEIGHT)) as g:
            canvas.alpha_composite(g)

    # text
    title    = (item.get("title") or "").upper()
    subtitle = (item.get("subtitle") or "").upper()
    hl_t     = {w.strip().upper() for w in (item.get("highlightWordsTitle") or "").split(",") if w.strip()}
    hl_s     = {w.strip().upper() for w in (item.get("highlightWordsDescription") or "").split(",") if w.strip()}

    t_img = Pillow_text_img(title, FONT_TITLE,
                            autosize(title, TITLE_MAX, TITLE_MIN, 30),
                            hl_t, 1000)
    sub_img = Pillow_text_img(subtitle, FONT_DESC,
                              autosize(subtitle, DESC_MAX, DESC_MIN, 45),
                              hl_s, 900) if subtitle else None

    # logo
    logo_local = os.path.join(tempfile.gettempdir(), "logo.png")
    logo = None
    if download_s3_file(TARGET_BUCKET, LOGO_KEY, logo_local):
        logo = Image.open(logo_local).convert("RGBA")
        scale = 200 / logo.width
        logo = logo.resize((int(logo.width * scale), int(logo.height * scale)))

    if logo:
        lx = WIDTH - logo.width - 50
        ly = HEIGHT - logo.height - 50
    else:
        ly = HEIGHT - 100

    if sub_img:
        y_sub   = ly - 50 - sub_img.height
        y_title = y_sub - 50 - t_img.height
    else:
        y_title = HEIGHT - 300 - t_img.height

    canvas.alpha_composite(t_img, ((WIDTH - t_img.width) // 2, y_title))
    if sub_img:
        canvas.alpha_composite(sub_img, ((WIDTH - sub_img.width) // 2, y_sub))
    if logo:
        stripe = Image.new("RGBA", (700, 4), ImageColor.getrgb(HIGHLIGHT_COLOR) + (255,))
        canvas.alpha_composite(stripe, (lx - 720, ly + logo.height // 2 - 2))
        canvas.alpha_composite(logo, (lx, ly))

    out = io.BytesIO()
    canvas.convert("RGB").save(out, "PNG", compress_level=3)
    out.seek(0)

    ts  = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    key = f"weekly_recap/{account}/img_{ts}_{item['createdAt']}.png"
    s3.upload_fileobj(out, TARGET_BUCKET, key,
                      ExtraArgs={"ContentType": "image/png"})
    return key, "photo"


# ─── MoviePy helpers (videos) ────────────────────────────────────────────
def dyn_font(text: str, max_s: int, min_s: int, ideal: int) -> int:
    size = autosize(text, max_s, min_s, ideal)
    return max(size, min_s)


def multi_coloured_clip(text: str,
                        highlights: Set[str],
                        font_path: str,
                        font_size: int,
                        max_width: int,
                        duration: float) -> CompositeVideoClip:
    """MoviePy version of Pillow_text_img."""
    words = text.split()
    lines, cur, cur_w = [], [], 0
    for w in words:
        w_w = measure_pillow(w, font_path, font_size)
        adv = w_w if not cur else w_w + 15
        if cur_w + adv <= max_width:
            cur.append(w); cur_w += adv
        else:
            lines.append(cur); cur, cur_w = [w], w_w
    if cur:
        lines.append(cur)

    line_clips = []
    for ln in lines:
        x_off, parts = 0, []
        for w in ln:
            colour = HIGHLIGHT_COLOR if w.strip(",.!?;:").upper() in highlights else "white"
            w_w = measure_pillow(w, font_path, font_size)
            txt = (
                TextClip(
                    txt=w,
                    font=font_path,
                    color=colour,
                    fontsize=font_size,
                    method="label",
                )
                .with_duration(duration)
                .with_position((x_off, 0))
            )
            x_off += w_w + 15
            parts.append(txt)
        line_w = max(x_off - 15, 1)
        line_h = parts[0].h if parts else 1
        line_composite = (
            CompositeVideoClip(parts, size=(line_w, line_h))
            .with_duration(duration)
        )
        line_clips.append(line_composite)

    max_w = max((c.w for c in line_clips), default=1)
    y_cur, stacked = 0, []
    for lc in line_clips:
        stacked.append(lc.with_position(((max_w - lc.w) // 2, y_cur)))
        y_cur += lc.h + 10
    total_h = max(y_cur - 10, 1)
    return (
        CompositeVideoClip(stacked, size=(max_w, total_h))
        .with_duration(duration)
    )


def render_video(item: Dict[str, Any], account: str) -> Tuple[List[str], str]:
    """Return [MP4‑key, PNG‑thumb‑key], and media type 'video'."""
    # download background video
    bg_key   = item.get("s3Key", "")
    local_bg = "/tmp/video_bg.mp4"
    if not download_s3_file(TARGET_BUCKET, bg_key, local_bg):
        logger.warning("video missing, fallback to photo path")
        return [render_photo(item, account)[0]], "photo"

    raw_bg = VideoFileClip(local_bg, audio=False)
    dur    = min(raw_bg.duration, DEFAULT_VID_DURATION)
    scale  = VID_W / raw_bg.w
    new_h  = int(raw_bg.h * scale)
    y_off  = (VID_H - new_h) // 2
    bg_clip = (
        raw_bg.with_effects([vfx.Resize((VID_W, new_h))])
        .with_duration(dur)
        .with_position((0, y_off))
    )
    base_black = ColorClip(size=(VID_W, VID_H), color=(0, 0, 0)).with_duration(dur)
    composite_clips = [base_black, bg_clip]

    # gradient overlay
    local_grad = "/tmp/grad.png"
    if download_s3_file(TARGET_BUCKET, GRADIENT_KEY, local_grad):
        grad_clip = (
            ImageClip(local_grad)
            .with_effects([vfx.Resize((VID_W, VID_H))])
            .with_duration(dur)
        )
        composite_clips.append(grad_clip)

    # text
    title = (item.get("title") or "").upper()
    sub   = (item.get("subtitle") or "").upper()
    hl_t  = {w.strip().upper() for w in (item.get("highlightWordsTitle") or "").split(",") if w.strip()}
    hl_s  = {w.strip().upper() for w in (item.get("highlightWordsDescription") or "").split(",") if w.strip()}

    title_clip = multi_coloured_clip(
        title, hl_t, FONT_TITLE, dyn_font(title, 100, 75, 25), 1000, dur
    )
    title_clip = title_clip.with_position(((VID_W - title_clip.w) // 2, 275))
    composite_clips.append(title_clip)

    if sub:
        sub_clip = multi_coloured_clip(
            sub, hl_s, FONT_DESC, dyn_font(sub, 70, 30, 45), 800, dur
        )
        sub_clip = sub_clip.with_position(
            ((VID_W - sub_clip.w) // 2, int(VID_H * 0.75))
        )
        composite_clips.append(sub_clip)

    # logo
    local_logo = "/tmp/logo.png"
    if download_s3_file(TARGET_BUCKET, LOGO_KEY, local_logo):
        logo_raw = ImageClip(local_logo)
        l_scale  = 200 / logo_raw.w
        logo_clip = (
            logo_raw.with_effects([vfx.Resize(l_scale)])
            .with_duration(dur)
        )
        line_left = ColorClip(size=(700, 4),
                              color=ImageColor.getrgb(HIGHLIGHT_COLOR)).with_duration(dur)
        gap, total_w = 20, 700 + gap + logo_clip.w
        total_h = max(logo_clip.h, 4)
        overlay = CompositeVideoClip(
            [
                line_left.with_position((0, (total_h - 4) // 2)),
                logo_clip.with_position((700 + gap, (total_h - logo_clip.h) // 2)),
            ],
            size=(total_w, total_h),
        ).with_duration(dur).with_position((VID_W - total_w - 50,
                                            VID_H - total_h - 100))
        composite_clips.append(overlay)

    final = CompositeVideoClip(composite_clips, size=(VID_W, VID_H)).with_duration(dur)
    ts = datetime.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    vid_key = f"weekly_recap/{account}/vid_{ts}_{item['createdAt']}.mp4"
    tmp_vid = "/tmp/out.mp4"
    final.write_videofile(tmp_vid, fps=24, codec="libx264",
                          audio=False, threads=2,
                          ffmpeg_params=["-preset", "ultrafast"])
    s3.upload_file(tmp_vid, TARGET_BUCKET, vid_key,
                   ExtraArgs={"ContentType": "video/mp4",
                              "ContentDisposition": 'attachment; filename="recap.mp4"'})

    # png thumbnail (first frame)
    thumb = final.get_frame(0)
    thumb_img = Image.fromarray(thumb)
    buf = io.BytesIO()
    thumb_img.save(buf, "PNG", compress_level=2)
    buf.seek(0)
    png_key = vid_key.replace(".mp4", ".png")
    s3.upload_fileobj(buf, TARGET_BUCKET, png_key,
                      ExtraArgs={"ContentType": "image/png"})

    return [vid_key, png_key], "video"


# ─── Dynamo helpers ──────────────────────────────────────────────────────
def list_accounts() -> Set[str]:
    seen = set()
    paginator = table.meta.client.get_paginator("scan")
    for pg in paginator.paginate(
        TableName=NEWS_TABLE, ProjectionExpression="accountName"
    ):
        for itm in pg.get("Items", []):
            seen.add(itm["accountName"])
    return seen


def latest_items(account: str, limit: int = 4) -> List[Dict[str, Any]]:
    return table.query(
        KeyConditionExpression=Key("accountName").eq(account),
        ScanIndexForward=False,
        Limit=limit,
    )["Items"]


# ─── Lambda entrypoint ───────────────────────────────────────────────────
def lambda_handler(event: Dict[str, Any], _ctx: Any) -> Dict[str, Any]:
    logger.info("weekly recap start")
    summary: Dict[str, int] = {}
    for acct in list_accounts():
        keys: List[str] = []
        for itm in latest_items(acct):
            if itm.get("backgroundType", "photo").lower() == "video":
                new_keys, _ = render_video(itm, acct)
                keys.extend(new_keys)
            else:
                k, _ = render_photo(itm, acct)
                keys.append(k)

        if not keys:
            continue

        # invoke Teams notifier
        lambda_cl.invoke(
            FunctionName=NOTIFY_POST_ARN,
            InvocationType="Event",
            Payload=json.dumps({"accountName": acct, "imageKeys": keys}).encode(),
        )
        summary[acct] = len(keys)

    logger.info("weekly recap complete: %s", summary)
    return {"status": "complete", "accounts": summary}


# ─── local debug ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    raw = os.environ.get("EVENT_JSON", "{}")
    evt = json.loads(raw)
    lambda_handler(evt, None)
