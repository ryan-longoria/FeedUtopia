import datetime
import io
import json
import logging
import os
import sys
import tempfile
from typing import Any, Dict, List, Optional, Set, Tuple

import boto3
import moviepy.video.fx as vfx
import numpy as np
from moviepy.video.VideoClip import ColorClip, ImageClip
from moviepy.video.compositing.CompositeVideoClip import CompositeVideoClip
from moviepy.video.io.VideoFileClip import VideoFileClip
from PIL import Image, ImageColor, ImageDraw, ImageFont

# ──────────────────────────────────────────────────────────────────────────────
# Logging
# ──────────────────────────────────────────────────────────────────────────────
logging.basicConfig(
    stream=sys.stdout,
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s"
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ──────────────────────────────────────────────────────────────────────────────
# Canvas / rendering constants
# ──────────────────────────────────────────────────────────────────────────────
WIDTH, HEIGHT = 1080, 1350      # Instagram portrait for carousel
VID_W, VID_H = WIDTH, HEIGHT
DEFAULT_DUR = 10
FPS = 24

TITLE_MAX, TITLE_MIN = 110, 75
DESC_MAX, DESC_MIN = 70, 30

HIGHLIGHT_COLOR = "#ec008c"
BASE_COLOR = "white"

GRADIENT_KEY = "artifacts/Black Gradient.png"
LOGO_KEY_GLOBAL = "artifacts/Logo.png"

# Fonts – packaged next to this script (fallback to system paths if missing)
ROOT = os.path.dirname(__file__)
FONT_TITLE_LOCAL = os.path.join(ROOT, "ariblk.ttf")
FONT_DESC_LOCAL = os.path.join(ROOT, "Montserrat-Medium.ttf")
FONT_TITLE_FALLBACK = "/usr/share/fonts/truetype/msttcorefonts/ariblk.ttf"
FONT_DESC_FALLBACK = "/usr/share/fonts/truetype/msttcorefonts/Montserrat-Medium.ttf"

# ──────────────────────────────────────────────────────────────────────────────
# Environment
# ──────────────────────────────────────────────────────────────────────────────
TARGET_BUCKET = os.environ.get("TARGET_BUCKET", "prod-sharedservices-artifacts-bucket")
TASK_TOKEN = os.environ.get("TASK_TOKEN")

s3 = boto3.client("s3")
sfn = boto3.client("stepfunctions")

# Temporary paths
LOCAL_GRADIENT = "/tmp/gradient.png"
LOCAL_LOGO = "/tmp/logo.png"
LOCAL_ARTIFACT = "/tmp/artifact.mov"


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
def get_font_path(pref_local: str, fallback: str) -> str:
    return pref_local if os.path.exists(pref_local) else fallback


FONT_TITLE = get_font_path(FONT_TITLE_LOCAL, FONT_TITLE_FALLBACK)
FONT_DESC = get_font_path(FONT_DESC_LOCAL, FONT_DESC_FALLBACK)


def logo_key_for(account: str) -> str:
    return f"artifacts/{account.lower()}/logo.png"


def download_s3_file(bucket: str, key: str, local: str) -> bool:
    try:
        s3.download_file(bucket, key, local)
        logger.info("Downloaded s3://%s/%s -> %s", bucket, key, local)
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
    size = max_sz - (len(text) - ideal) * factor
    return max(int(size), min_sz)


def Pillow_text_img(
    text: str,
    font_path: str,
    font_size: int,
    highlights: Set[str],
    max_width: int,
    space: int = 15,
    line_gap: int = 12,
) -> Image.Image:
    font = ImageFont.truetype(font_path, font_size)
    words = text.split()
    lines: List[List[Tuple[str, Tuple[int, int, int, int]]]] = []
    cur: List[Tuple[str, Tuple[int, int, int, int]]] = []
    w_cur = 0

    for w in words:
        bb = font.getbbox(w)
        w_w = bb[2]
        adv = w_w if not cur else w_w + space
        if w_cur + adv <= max_width:
            cur.append((w, bb))
            w_cur += adv
        else:
            lines.append(cur)
            cur = [(w, bb)]
            w_cur = w_w
    if cur:
        lines.append(cur)

    rendered: List[Image.Image] = []
    for ln in lines:
        x_off = 0
        line_h = 0
        pieces = []
        for w, bb in ln:
            w_w = bb[2] - bb[0]
            w_h = bb[3] - bb[1]
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

    tot_h = sum(i.height for i in rendered) + line_gap * (len(rendered) - 1)
    canvas = Image.new("RGBA", (max_width, tot_h), (0, 0, 0, 0))
    y = 0
    for img in rendered:
        canvas.paste(img, ((max_width - img.width) // 2, y), img)
        y += img.height + line_gap
    return canvas


def parse_highlights(raw: str) -> Set[str]:
    return {w.strip().upper() for w in (raw or "").split(",") if w.strip()}


def ensure_gradient() -> bool:
    return download_s3_file(TARGET_BUCKET, GRADIENT_KEY, LOCAL_GRADIENT)


def ensure_logo(account: str) -> bool:
    if download_s3_file(TARGET_BUCKET, logo_key_for(account), LOCAL_LOGO):
        return True
    return download_s3_file(TARGET_BUCKET, LOGO_KEY_GLOBAL, LOCAL_LOGO)


def artifact_key_for(name: str) -> Optional[str]:
    name = (name or "").upper()
    if name in {"NEWS", "TRAILER", "FACT", "THROWBACK", "VS"}:
        return f"artifacts/{name}.mov"
    return None


def presign_upload(key: str, buf: bytes, content_type: str) -> bool:
    try:
        s3.upload_fileobj(io.BytesIO(buf), TARGET_BUCKET, key, ExtraArgs={"ContentType": content_type})
        return True
    except Exception as exc:
        logger.error("upload %s failed: %s", key, exc)
        return False


def upload_file(local: str, key: str, content_type: str) -> bool:
    try:
        s3.upload_file(local, TARGET_BUCKET, key, ExtraArgs={"ContentType": content_type})
        return True
    except Exception as exc:
        logger.error("upload %s failed: %s", key, exc)
        return False


def send_task_success(payload: Dict[str, Any]) -> None:
    if not TASK_TOKEN:
        logger.warning("TASK_TOKEN not set; likely running locally")
        return
    sfn.send_task_success(taskToken=TASK_TOKEN, output=json.dumps(payload))


def send_task_failure(msg: str) -> None:
    if not TASK_TOKEN:
        logger.warning("TASK_TOKEN not set; likely running locally")
        return
    sfn.send_task_failure(taskToken=TASK_TOKEN, error="RenderError", cause=msg)


# ──────────────────────────────────────────────────────────────────────────────
# Selection helpers for per‑slide fields
# ──────────────────────────────────────────────────────────────────────────────
def first_nonempty(*vals: Optional[str]) -> str:
    for v in vals:
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return ""


def _pick_presence_aware(slide: Dict[str, Any], keys: List[str]) -> Optional[str]:
    """Return the first present key's value (even if empty string). 
    Return None only if none of the keys are present."""
    for k in keys:
        if k in slide:
            return slide.get(k) or ""
    return None


def slide_texts_and_highlights(
    slide: Dict[str, Any],
    global_title: str,
    global_subtitle: str,
    global_hl_t: Set[str],
    global_hl_s: Set[str],
) -> Tuple[str, str, Set[str], Set[str]]:
    # Title (presence-aware; if no title keys present, fall back to global)
    t_local = _pick_presence_aware(slide, ["title", "slideTitle", "titleText"])
    t_raw = t_local if t_local is not None else (global_title or "")

    # Subtitle (presence-aware to allow intentional blank)
    s_local = _pick_presence_aware(slide, ["subtitle", "description", "slideSubtitle"])
    s_raw = s_local if s_local is not None else (global_subtitle or "")

    # Highlights (presence-aware so slides can clear them)
    ht_local = _pick_presence_aware(slide, ["highlightWordsTitle", "hlTitle", "titleHighlights"])
    hs_local = _pick_presence_aware(
        slide, ["highlightWordsDescription", "highlightWordsSubtitle", "hlSubtitle", "subtitleHighlights"]
    )
    ht_raw = ht_local if ht_local is not None else None
    hs_raw = hs_local if hs_local is not None else None

    title = (t_raw or "").upper()
    subtitle = (s_raw or "").upper()

    hl_t = parse_highlights(ht_raw) if ht_raw is not None else set(global_hl_t)
    hl_s = parse_highlights(hs_raw) if hs_raw is not None else set(global_hl_s)

    return title, subtitle, hl_t, hl_s



# ──────────────────────────────────────────────────────────────────────────────
# Rendering primitives
# ──────────────────────────────────────────────────────────────────────────────
def resize_and_crop_to_canvas(img: Image.Image) -> Image.Image:
    """Resize to WIDTH keeping aspect, then crop/pad top-crop to HEIGHT."""
    im = img.resize((WIDTH, int(img.height * WIDTH / img.width)), Image.LANCZOS)
    if im.height > HEIGHT:
        im = im.crop((0, 0, WIDTH, HEIGHT))
    else:
        canvas = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))
        y = (HEIGHT - im.height) // 2
        canvas.paste(im, (0, y))
        im = canvas
    return im


def compose_photo_slide_first(
    bg_local: str,
    title: str,
    subtitle: str,
    hl_t: Set[str],
    hl_s: Set[str],
    account: str,
    artifact_name: str,
) -> Image.Image:
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))
    with Image.open(bg_local).convert("RGBA") as im:
        im = resize_and_crop_to_canvas(im)
        canvas.paste(im, (0, 0))
    if os.path.exists(LOCAL_GRADIENT):
        with Image.open(LOCAL_GRADIENT).convert("RGBA").resize((WIDTH, HEIGHT)) as g:
            canvas.alpha_composite(g)

    t_img = Pillow_text_img(title, FONT_TITLE, autosize(title, TITLE_MAX, TITLE_MIN, 35), hl_t, 1000)
    sub_img = Pillow_text_img(subtitle, FONT_DESC, autosize(subtitle, DESC_MAX, DESC_MIN, 45), hl_s, 600) if subtitle else None

    if sub_img:
        y_sub = HEIGHT - 225 - sub_img.height
        y_title = y_sub - 50 - t_img.height
    else:
        y_title = HEIGHT - 150 - t_img.height

    canvas.alpha_composite(t_img, ((WIDTH - t_img.width) // 2, y_title))
    if sub_img:
        canvas.alpha_composite(sub_img, ((WIDTH - sub_img.width) // 2, y_sub))

    # Artifact (static frame) – top-left
    key = artifact_key_for(artifact_name)
    if key and download_s3_file(TARGET_BUCKET, key, LOCAL_ARTIFACT):
        try:
            clip = VideoFileClip(LOCAL_ARTIFACT, has_mask=True)
            frame = clip.get_frame(0)
            clip.close()
            art = Image.fromarray(frame).convert("RGBA")
            target_w = 400 if artifact_name.upper() in {"TRAILER", "THROWBACK"} else 250
            scale = target_w / art.width
            art = art.resize((target_w, int(art.height * scale)), Image.LANCZOS)
            canvas.alpha_composite(art, (50, 50))
        except Exception as exc:
            logger.warning("artifact overlay failed: %s", exc)

    # Logo + stripe
    if ensure_logo(account):
        try:
            logo = Image.open(LOCAL_LOGO).convert("RGBA")
            logo = logo.resize((200, int(200 * logo.height / logo.width)), Image.LANCZOS)
            lx, ly = WIDTH - logo.width - 50, HEIGHT - logo.height - 50
            stripe = Image.new("RGBA", (700, 4), ImageColor.getrgb(HIGHLIGHT_COLOR) + (255,))
            canvas.alpha_composite(stripe, (lx - 720, ly + logo.height // 2 - 2))
            canvas.alpha_composite(logo, (lx, ly))
        except Exception as exc:
            logger.warning("logo overlay failed: %s", exc)

    return canvas


def compose_photo_slide_with_text(
    bg_local: str,
    title: str,
    subtitle: str,
    hl_t: Set[str],
    hl_s: Set[str],
) -> Image.Image:
    """
    Non-first PHOTO slide with text. Lowered placement (no logo present):
      - subtitle: HEIGHT - 100 - h
      - title: 50px above subtitle block
      - if no subtitle: title at HEIGHT - 100 - h
    """
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 255))
    with Image.open(bg_local).convert("RGBA") as im:
        im = resize_and_crop_to_canvas(im)
        canvas.paste(im, (0, 0))

    if os.path.exists(LOCAL_GRADIENT):
        with Image.open(LOCAL_GRADIENT).convert("RGBA").resize((WIDTH, HEIGHT)) as g:
            canvas.alpha_composite(g)

    title = (title or "").upper()
    subtitle = (subtitle or "").upper()

    t_img = Pillow_text_img(title, FONT_TITLE, autosize(title, TITLE_MAX, TITLE_MIN, 35), hl_t, 1000) if title else None
    s_img = Pillow_text_img(subtitle, FONT_DESC, autosize(subtitle, DESC_MAX, DESC_MIN, 45), hl_s, 600) if subtitle else None

    if t_img and s_img:
        y_sub = HEIGHT - 100 - s_img.height
        y_title = y_sub - 50 - t_img.height
        canvas.alpha_composite(t_img, ((WIDTH - t_img.width) // 2, y_title))
        canvas.alpha_composite(s_img, ((WIDTH - s_img.width) // 2, y_sub))
    elif t_img:
        y_title = HEIGHT - 100 - t_img.height
        canvas.alpha_composite(t_img, ((WIDTH - t_img.width) // 2, y_title))
    elif s_img:
        y_sub = HEIGHT - 100 - s_img.height
        canvas.alpha_composite(s_img, ((WIDTH - s_img.width) // 2, y_sub))

    return canvas


def compose_photo_slide_plain(bg_local: str) -> Image.Image:
    canvas = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 255))
    with Image.open(bg_local).convert("RGBA") as im:
        im = resize_and_crop_to_canvas(im)
        canvas.paste(im, (0, 0))
    if os.path.exists(LOCAL_GRADIENT):
        with Image.open(LOCAL_GRADIENT).convert("RGBA").resize((WIDTH, HEIGHT)) as g:
            canvas.alpha_composite(g)
    return canvas


def compose_video_background(local_mp4: str, dur: float) -> CompositeVideoClip:
    raw_bg = VideoFileClip(local_mp4, audio=False)
    scale = VID_W / raw_bg.w
    new_h = int(raw_bg.h * scale)
    scaled = raw_bg.with_effects([vfx.Resize((VID_W, new_h))]).with_duration(dur)

    y_offset = (0 if new_h > VID_H else (VID_H - new_h) // 2) + 40
    base = ColorClip((VID_W, VID_H), color=(0, 0, 0)).with_duration(dur)
    composite: List = [base, scaled.with_position((0, y_offset))]
    return CompositeVideoClip(composite, size=(VID_W, VID_H)).with_duration(dur)


def compose_video_slide_first(
    bg_local: str,
    title: str,
    subtitle: str,
    hl_t: Set[str],
    hl_s: Set[str],
    artifact_name: str,
    account: str,
) -> Tuple[CompositeVideoClip, float]:
    raw = VideoFileClip(bg_local, audio=False)
    dur = min(raw.duration, DEFAULT_DUR)
    raw.close()

    bg_clip = compose_video_background(bg_local, dur)

    clips: List = [bg_clip]

    t_img = Pillow_text_img(title, FONT_TITLE, autosize(title, 100, 75, 25), hl_t, 1000)
    t_clip = ImageClip(np.array(t_img)).with_duration(dur).with_position(("center", 25))
    clips.append(t_clip)

    if subtitle:
        s_img = Pillow_text_img(subtitle, FONT_DESC, autosize(subtitle, 70, 30, 45), hl_s, 800)
        s_clip = (
            ImageClip(np.array(s_img))
            .with_duration(dur)
            .with_position(("center", VID_H - 150 - s_img.height))
        )
        clips.append(s_clip)

    # Artifact video overlay – TOP-LEFT
    key = artifact_key_for(artifact_name)
    if key and download_s3_file(TARGET_BUCKET, key, LOCAL_ARTIFACT):
        try:
            art_raw = VideoFileClip(LOCAL_ARTIFACT, has_mask=True)
            scale_target = 400 if artifact_name.upper() in {"TRAILER", "THROWBACK"} else 250
            scale_factor = scale_target / art_raw.w
            art_clip = art_raw.with_effects([vfx.Resize(scale_factor)]).with_duration(dur)
            clips.append(art_clip.with_position((50, 50)))
        except Exception as exc:
            logger.warning("artifact video overlay failed: %s", exc)

    if ensure_logo(account):
        try:
            logo_img = Image.open(LOCAL_LOGO)
            scale_logo = 200 / logo_img.width
            logo_clip = ImageClip(np.array(logo_img)).with_effects([vfx.Resize(scale_logo)]).with_duration(dur)

            line_w = 700
            line_h = 4
            line_color = ImageColor.getrgb(HIGHLIGHT_COLOR)
            line_clip = ColorClip((line_w, line_h), color=line_color).with_duration(dur)

            total_w = line_w + 20 + logo_clip.w
            total_h = max(line_h, logo_clip.h)

            logo_block = (
                CompositeVideoClip(
                    [
                        line_clip.with_position((0, (total_h - line_h) // 2)),
                        logo_clip.with_position((line_w + 20, (total_h - logo_clip.h) // 2)),
                    ],
                    size=(total_w, total_h),
                )
                .with_duration(dur)
                .with_position((VID_W - total_w - 50, VID_H - total_h - 100))
            )
            clips.append(logo_block)
        except Exception as exc:
            logger.warning("logo video overlay failed: %s", exc)

    final = CompositeVideoClip(clips, size=(VID_W, VID_H)).with_duration(dur)
    return final, dur


def compose_video_slide_with_text(
    bg_local: str,
    title: str,
    subtitle: str,
    hl_t: Set[str],
    hl_s: Set[str],
) -> Tuple[CompositeVideoClip, float]:
    """
    Non-first VIDEO slide with text, lowered positions (no logo):
      - title y = 100
      - subtitle y = VID_H - 100 - subtitle_height
    No gradient, no logo, no artifact.
    """
    raw = VideoFileClip(bg_local, audio=False)
    dur = min(raw.duration, DEFAULT_DUR)
    raw.close()

    bg_clip = compose_video_background(bg_local, dur)
    clips: List = [bg_clip]

    t = (title or "").upper()
    s = (subtitle or "").upper()
    if t:
        t_img = Pillow_text_img(t, FONT_TITLE, autosize(t, 100, 75, 25), hl_t, 1000)
        clips.append(ImageClip(np.array(t_img)).with_duration(dur).with_position(("center", 100)))
    if s:
        s_img = Pillow_text_img(s, FONT_DESC, autosize(s, 70, 30, 45), hl_s, 800)
        clips.append(
            ImageClip(np.array(s_img))
            .with_duration(dur)
            .with_position(("center", VID_H - 100 - s_img.height))
        )

    final = CompositeVideoClip(clips, size=(VID_W, VID_H)).with_duration(dur)
    return final, dur


def compose_video_slide_plain(bg_local: str) -> Tuple[CompositeVideoClip, float]:
    raw = VideoFileClip(bg_local, audio=False)
    dur = min(raw.duration, DEFAULT_DUR)
    raw.close()
    bg_clip = compose_video_background(bg_local, dur)
    final = CompositeVideoClip([bg_clip], size=(VID_W, VID_H)).with_duration(dur)
    return final, dur


def compose_still_video_slide_first(
    bg_local: str,
    title: str,
    subtitle: str,
    hl_t: Set[str],
    hl_s: Set[str],
    artifact_name: str,
    account: str,
) -> Tuple[CompositeVideoClip, float]:
    dur = float(DEFAULT_DUR)
    with Image.open(bg_local).convert("RGBA") as im:
        im = resize_and_crop_to_canvas(im)
        bg_arr = np.array(im)

    base = ColorClip((VID_W, VID_H), color=(0, 0, 0)).with_duration(dur)
    bg_clip = ImageClip(bg_arr).with_duration(dur).with_position((0, 0))
    clips: List = [base, bg_clip]

    if os.path.exists(LOCAL_GRADIENT):
        try:
            g_img = Image.open(LOCAL_GRADIENT).convert("RGBA").resize((VID_W, VID_H))
            g_clip = ImageClip(np.array(g_img)).with_duration(dur).with_position((0, 0))
            clips.append(g_clip)
        except Exception as exc:
            logger.warning("gradient overlay failed: %s", exc)

    # PHOTO-style text placement on a still-turned-video
    t_img = Pillow_text_img(title, FONT_TITLE, autosize(title, TITLE_MAX, TITLE_MIN, 35), hl_t, 1000)
    t_w, t_h = t_img.width, t_img.height

    if subtitle:
        s_img = Pillow_text_img(subtitle, FONT_DESC, autosize(subtitle, DESC_MAX, DESC_MIN, 45), hl_s, 600)
        s_w, s_h = s_img.width, s_img.height
        y_sub = HEIGHT - 225 - s_h
        y_title = y_sub - 50 - t_h
        s_clip = ImageClip(np.array(s_img)).with_duration(dur).with_position(((VID_W - s_w)//2, y_sub))
        clips.append(s_clip)
    else:
        y_title = HEIGHT - 150 - t_h

    t_clip = ImageClip(np.array(t_img)).with_duration(dur).with_position(((VID_W - t_w)//2, y_title))
    clips.append(t_clip)

    # Spinner artifact – TOP-LEFT
    key = artifact_key_for(artifact_name)
    if key and download_s3_file(TARGET_BUCKET, key, LOCAL_ARTIFACT):
        try:
            art_raw = VideoFileClip(LOCAL_ARTIFACT, has_mask=True)
            scale_target = 400 if artifact_name.upper() in {"TRAILER", "THROWBACK"} else 250
            scale_factor = scale_target / art_raw.w
            art_clip = art_raw.with_effects([vfx.Resize(scale_factor)]).with_duration(dur)
            clips.append(art_clip.with_position((50, 50)))
        except Exception as exc:
            logger.warning("artifact video overlay (still) failed: %s", exc)

    if ensure_logo(account):
        try:
            logo_img = Image.open(LOCAL_LOGO)
            scale_logo = 200 / logo_img.width
            logo_clip = ImageClip(np.array(logo_img)).with_effects([vfx.Resize(scale_logo)]).with_duration(dur)

            line_w = 700
            line_h = 4
            line_color = ImageColor.getrgb(HIGHLIGHT_COLOR)
            line_clip = ColorClip((line_w, line_h), color=line_color).with_duration(dur)

            total_w = line_w + 20 + logo_clip.w
            total_h = max(line_h, logo_clip.h)

            logo_block = (
                CompositeVideoClip(
                    [
                        line_clip.with_position((0, (total_h - line_h) // 2)),
                        logo_clip.with_position((line_w + 20, (total_h - logo_clip.h) // 2)),
                    ],
                    size=(total_w, total_h),
                )
                .with_duration(dur)
                .with_position((VID_W - total_w - 50, VID_H - total_h - 100))
            )
            clips.append(logo_block)
        except Exception as exc:
            logger.warning("logo block (still) failed: %s", exc)

    final = CompositeVideoClip(clips, size=(VID_W, VID_H)).with_duration(dur)
    return final, dur


# ──────────────────────────────────────────────────────────────────────────────
# Main handler
# ──────────────────────────────────────────────────────────────────────────────
def render_carousel(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Expects optional per-slide fields:
      slide.title / slide.slideTitle / slide.titleText
      slide.subtitle / slide.description / slide.slideSubtitle
      slide.highlightWordsTitle / slide.hlTitle / slide.titleHighlights
      slide.highlightWordsDescription / slide.highlightWordsSubtitle / slide.hlSubtitle / slide.subtitleHighlights
    Falls back to global event.title / event.description / event.highlightWordsTitle / event.highlightWordsDescription.
    """
    logger.info("Slides payload:\n%s", json.dumps(event.get("slides", []), indent=2))
    account = (event.get("accountName") or "").strip()

    # global fallbacks
    global_title = (event.get("title") or "").strip()
    global_subtitle = (event.get("description") or "").strip()
    global_hl_t = parse_highlights(event.get("highlightWordsTitle"))
    global_hl_s = parse_highlights(event.get("highlightWordsDescription"))

    artifact = (event.get("spinningArtifact") or "").upper()
    slides = event.get("slides") or []

    if not slides:
        raise ValueError("No slides provided")

    ensure_gradient()
    ensure_logo(account)

    ts = datetime.datetime.utcnow().strftime("%Y%m%d%H%M%S")
    base_folder = f"posts/post_{ts}"
    out_keys: List[str] = []

    for idx, slide in enumerate(slides, start=1):
        bg_type = (slide.get("backgroundType") or "photo").lower()
        s3_key = slide.get("key") or ""
        if not s3_key:
            logger.warning("Slide %d missing key; skipping", idx)
            continue

        # ►► get per-slide text & highlights (with global fallbacks)
        slide_title, slide_sub, slide_hl_t, slide_hl_s = slide_texts_and_highlights(
            slide, global_title, global_subtitle, global_hl_t, global_hl_s
        )

        local_bg = os.path.join(tempfile.gettempdir(), f"slide_{idx}.{'mp4' if bg_type == 'video' else 'img'}")
        if not download_s3_file(TARGET_BUCKET, s3_key, local_bg):
            logger.warning("Slide %d download failed; skipping", idx)
            continue

        is_first = (idx == 1)

        # First slide ALWAYS outputs video (10s for photo)
        if is_first:
            if bg_type == "video":
                final, dur = compose_video_slide_first(local_bg, slide_title.upper(), slide_sub.upper(),
                                                       slide_hl_t, slide_hl_s, artifact, account)
            else:
                final, dur = compose_still_video_slide_first(local_bg, slide_title.upper(), slide_sub.upper(),
                                                             slide_hl_t, slide_hl_s, artifact, account)

            mp4_local = f"/tmp/slide_{idx}.mp4"
            final.write_videofile(
                mp4_local,
                fps=FPS,
                codec="libx264",
                audio=False,
                threads=2,
                ffmpeg_params=["-preset", "ultrafast"],
            )
            final.close()

            mp4_key = f"{base_folder}/slide_{idx:02d}.mp4"
            if upload_file(mp4_local, mp4_key, "video/mp4"):
                out_keys.append(mp4_key)

            # Thumbnail PNG
            try:
                tmp_clip = VideoFileClip(mp4_local, audio=False)
                frame = tmp_clip.get_frame(0)
                tmp_clip.close()
                thumb = Image.fromarray(frame)
                buf = io.BytesIO()
                thumb.save(buf, "PNG", compress_level=2)
                buf.seek(0)
                png_key = f"{base_folder}/slide_{idx:02d}.png"
                if presign_upload(png_key, buf.getvalue(), "image/png"):
                    out_keys.append(png_key)
            except Exception as exc:
                logger.warning("thumb generation failed for slide %d: %s", idx, exc)

        else:
            if bg_type == "video":
                final, dur = compose_video_slide_with_text(
                    local_bg, slide_title, slide_sub, slide_hl_t, slide_hl_s
                )

                mp4_local = f"/tmp/slide_{idx}.mp4"
                final.write_videofile(
                    mp4_local,
                    fps=FPS,
                    codec="libx264",
                    audio=False,
                    threads=2,
                    ffmpeg_params=["-preset", "ultrafast"],
                )
                final.close()

                mp4_key = f"{base_folder}/slide_{idx:02d}.mp4"
                if upload_file(mp4_local, mp4_key, "video/mp4"):
                    out_keys.append(mp4_key)

                try:
                    tmp_clip = VideoFileClip(mp4_local, audio=False)
                    frame = tmp_clip.get_frame(0)
                    tmp_clip.close()
                    thumb = Image.fromarray(frame)
                    buf = io.BytesIO()
                    thumb.save(buf, "PNG", compress_level=2)
                    buf.seek(0)
                    png_key = f"{base_folder}/slide_{idx:02d}.png"
                    if presign_upload(png_key, buf.getvalue(), "image/png"):
                        out_keys.append(png_key)
                except Exception as exc:
                    logger.warning("thumb generation failed for slide %d: %s", idx, exc)

            else:
                canvas = compose_photo_slide_with_text(
                    local_bg, slide_title, slide_sub, slide_hl_t, slide_hl_s
                )

                buf = io.BytesIO()
                canvas.convert("RGB").save(buf, "PNG", compress_level=3)
                buf.seek(0)
                png_key = f"{base_folder}/slide_{idx:02d}.png"
                if presign_upload(png_key, buf.getvalue(), "image/png"):
                    out_keys.append(png_key)

    return {"status": "rendered", "imageKeys": out_keys, "folder": base_folder}


def lambda_handler(event: Dict[str, Any], _ctx: Any) -> Dict[str, Any]:
    logger.info("carousel render start: %s", json.dumps(event))
    try:
        result = render_carousel(event)
        logger.info("carousel render complete: %s", json.dumps(result))
        if TASK_TOKEN:
            send_task_success(result)
        return result
    except Exception as exc:
        logger.exception("carousel render failed")
        if TASK_TOKEN:
            send_task_failure(str(exc))
        return {"status": "error", "error": str(exc)}


if __name__ == "__main__":
    raw = os.getenv("EVENT_JSON", "{}")
    try:
        evt = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("Invalid EVENT_JSON: %s", exc)
        sys.exit(1)

    res = lambda_handler(evt, None)
    logger.info("Result: %s", json.dumps(res))
    if res.get("status") == "error":
        sys.exit(1)
