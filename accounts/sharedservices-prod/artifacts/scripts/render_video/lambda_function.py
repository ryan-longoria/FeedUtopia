import datetime
import json
import logging
import os
import sys
from typing import Any, Dict, Optional, Set, Tuple

import boto3
import moviepy.video.fx as vfx
import requests
import numpy as np
from moviepy.video.VideoClip import ColorClip, ImageClip, TextClip
from moviepy.video.compositing.CompositeVideoClip import CompositeVideoClip
from moviepy.video.io.VideoFileClip import VideoFileClip
from PIL import Image, ImageColor, ImageDraw, ImageFont 

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DEFAULT_VIDEO_WIDTH = 1080
DEFAULT_VIDEO_HEIGHT = 1920
DEFAULT_DURATION = 10
FONT_PATH = "/usr/share/fonts/truetype/msttcorefonts/ariblk.ttf"
SUBTITLE_FONT_PATH = (
    "/usr/share/fonts/truetype/msttcorefonts/Montserrat-Medium.ttf"
)

LOCAL_COMPLETE_VIDEO = "/mnt/efs/complete_post.mp4"
LOCAL_BG_IMAGE = "/tmp/backgroundimage_converted.jpg"
LOCAL_BG_VIDEO = "/tmp/backgroundvideo_converted.mp4"
LOCAL_GRADIENT = "/tmp/Black_Gradient.png"
LOCAL_NEWS = "/tmp/NEWS.mov"
LOCAL_LOGO = "/tmp/Logo.png"

TARGET_BUCKET = os.environ.get("TARGET_BUCKET", "my-bucket")

s3 = boto3.client("s3")


def download_s3_file(bucket_name: str, key: str, local_path: str) -> bool:
    """
    Download a file from S3 to the specified local path.
    Returns True if successful, False otherwise.
    """
    try:
        s3.download_file(bucket_name, key, local_path)
        logger.info("Downloaded from S3: %s -> %s", key, local_path)
        return True
    except Exception as exc:
        logger.error(
            "S3 download failed for key='%s' in bucket='%s': %s",
            key,
            bucket_name,
            exc,
        )
        return False


def download_http_file(url: str, local_path: str, timeout: int = 10) -> bool:
    """
    Download a file from an HTTP URL to the specified local path.
    Returns True if successful, False otherwise.
    """
    try:
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
        with open(local_path, "wb") as file_obj:
            file_obj.write(resp.content)
        logger.info("Downloaded via HTTP: %s -> %s", url, local_path)
        return True
    except Exception as exc:
        logger.error("HTTP download failed for '%s': %s", url, exc)
        return False


def measure_text_width_pillow(word: str, font_path: str, font_size: int) -> int:
    """
    Measure the width of the given text string in pixels using
    the specified TrueType font and size.
    """
    font = ImageFont.truetype(font_path, font_size)
    bbox = font.getbbox(word)
    return bbox[2] - bbox[0]


def dynamic_font_size(
    text: str,
    max_size: int,
    min_size: int,
    ideal_length: int,
) -> int:
    """
    Dynamically determine a suitable font size for the given text length.
    """
    length = len(text)
    if length <= ideal_length:
        return max_size

    factor = (max_size - min_size) / ideal_length
    new_size = max_size - (length - ideal_length) * factor
    return int(new_size) if new_size > min_size else min_size

def pillow_text_img(
    text: str,
    font_path: str,
    font_size: int,
    highlights: Set[str],
    max_width: int,
    space: int = 15,
) -> Image.Image:
    """
    Render multiline text with per‑word highlights into a transparent RGBA image.
    """
    font = ImageFont.truetype(font_path, font_size)
    words = text.split()
    lines, cur, cur_w = [], [], 0

    for w in words:
        w_bb = font.getbbox(w)
        w_w = w_bb[2] - w_bb[0]
        need = w_w + (space if cur else 0)
        if cur_w + need <= max_width:
            cur.append((w, w_bb))
            cur_w += need
        else:
            lines.append(cur)
            cur, cur_w = [(w, w_bb)], w_w
    if cur:
        lines.append(cur)

    rendered: list[Image.Image] = []
    for ln in lines:
        x_off, h_line, pieces = 0, 0, []
        for w, bb in ln:
            w_w, w_h = bb[2] - bb[0], bb[3] - bb[1]
            colour = "#ec008c" if w.strip(",.!?;:").upper() in highlights else "white"
            img = Image.new("RGBA", (w_w, w_h), (0, 0, 0, 0))
            ImageDraw.Draw(img).text((-bb[0], -bb[1]), w, font=font, fill=colour)
            pieces.append((img, x_off))
            x_off += w_w + space
            h_line = max(h_line, w_h)
        line_img = Image.new("RGBA", (x_off - space, h_line), (0, 0, 0, 0))
        for img, xo in pieces:
            line_img.paste(img, (xo, 0), img)
        rendered.append(line_img)

    total_h = sum(i.height for i in rendered) + 10 * (len(rendered) - 1)
    canvas = Image.new("RGBA", (max_width, total_h), (0, 0, 0, 0))
    y_cur = 0
    for img in rendered:
        canvas.paste(img, ((max_width - img.width) // 2, y_cur), img)
        y_cur += img.height + 10
    return canvas

def create_multiline_colored_clip(
    full_text: str,
    highlight_words: Set[str],
    font_path: str,
    font_size: int,
    max_width: int,
    color_default: str = "white",
    color_highlight: str = "#ec008c",
    space: int = 15,
    line_spacing: int = 10,
    duration: int = 10,
) -> CompositeVideoClip:
    """
    NEW IMPLEMENTATION: Use Pillow to render once, then wrap in ImageClip.
    """
    img = pillow_text_img(
        full_text,
        font_path,
        font_size,
        highlight_words,
        max_width,
        space,
    )
    return ImageClip(np.array(img)).with_duration(duration)


def parse_highlight_words(event: Dict[str, Any]) -> Tuple[Set[str], Set[str]]:
    """
    Parse highlight words from the event.
    """
    title_raw = event.get("highlightWordsTitle", "") or ""
    desc_raw = event.get("highlightWordsDescription", "") or ""
    title_set = {w.strip().upper() for w in title_raw.split(",") if w.strip()}
    desc_set = {w.strip().upper() for w in desc_raw.split(",") if w.strip()}
    return title_set, desc_set


def parse_text(event: Dict[str, Any]) -> Tuple[str, str]:
    """
    Parse the title and description (if any) from the event.
    """
    desc_raw = event.get("description")
    if desc_raw and desc_raw.strip().lower() == "none":
        desc_raw = None
    title_text = (event.get("title") or "").upper()
    description_text = desc_raw.upper() if desc_raw else ""
    return title_text, description_text


def download_background(
    event: Dict[str, Any],
    bucket_name: str,
) -> Tuple[str, bool]:
    """
    Download the background (image or video) specified in the event.
    Returns local path and a success flag.
    """
    background_type = event.get("backgroundType", "image").lower()
    if background_type == "video":
        background_path = event.get("video_path", "")
        bg_local_path = LOCAL_BG_VIDEO
    else:
        background_path = event.get("image_path", "")
        bg_local_path = LOCAL_BG_IMAGE

    downloaded_bg = False
    if background_path:
        if background_path.startswith("http"):
            downloaded_bg = download_http_file(background_path, bg_local_path)
        else:
            downloaded_bg = download_s3_file(
                bucket_name, background_path, bg_local_path
            )

    return bg_local_path, downloaded_bg


def create_background_clip(
    local_path: str,
    downloaded_bg: bool,
    background_type: str,
    width: int,
    height: int,
    default_duration: int,
) -> Tuple[CompositeVideoClip, float]:
    """
    Create and resize a background clip based on whether it's an image or video.
    Returns the clip and the determined duration.
    """
    if downloaded_bg and os.path.exists(local_path):
        if background_type == "video":
            raw_bg = VideoFileClip(local_path, audio=True)
            duration_sec = raw_bg.duration
            scale_factor = width / raw_bg.w
            new_height = int(raw_bg.h * scale_factor)
            black_bg = ColorClip((width, height), color=(0, 0, 0)).with_duration(
                duration_sec
            )
            y_offset = (height - new_height) // 2
            scaled_bg = (
                raw_bg.with_effects([vfx.Resize((width, new_height))])
                .with_duration(duration_sec)
                .with_position((0, y_offset))
            )
            bg_clip = CompositeVideoClip(
                [black_bg, scaled_bg], size=(width, height)
            ).with_duration(duration_sec)
        else:
            raw_bg = ImageClip(local_path)
            duration_sec = default_duration
            bg_clip = (
                raw_bg.with_effects([vfx.Resize((width, height))])
                .with_duration(duration_sec)
            )
    else:
        logger.warning(
            "Failed to download background or background path missing."
        )
        bg_clip = ColorClip((width, height), color=(0, 0, 0)).with_duration(
            default_duration
        )
        duration_sec = default_duration

    return bg_clip, duration_sec


def create_artifact_clip(
    spinning_artifact: str,
    bucket_name: str,
    background_type: str,
) -> Optional[VideoFileClip]:
    """
    Download and prepare the artifact clip (NEWS, TRAILER, or FACT), if requested.
    Returns a moviepy clip or None if not used.
    """
    if spinning_artifact not in [
        "NEWS",
        "TRAILER",
        "FACT",
        "THROWBACK",
        "VS",
    ]:
        return None

    if spinning_artifact == "NEWS":
        artifact_key = "artifacts/NEWS.mov"
        scale_target = 250
    elif spinning_artifact == "TRAILER":
        artifact_key = "artifacts/TRAILER.mov"
        scale_target = 400
    elif spinning_artifact == "FACT":
        artifact_key = "artifacts/FACT.mov"
        scale_target = 250
    elif spinning_artifact == "THROWBACK":
        artifact_key = "artifacts/THROWBACK.mov"
        scale_target = 400
    else:
        artifact_key = "artifacts/VS.mov"
        scale_target = 250

    downloaded = download_s3_file(bucket_name, artifact_key, LOCAL_NEWS)
    if downloaded and os.path.exists(LOCAL_NEWS):
        raw_clip = VideoFileClip(LOCAL_NEWS, has_mask=True)
        scale_factor = scale_target / raw_clip.w
        artifact_clip = raw_clip.with_effects([vfx.Resize(scale_factor)])
        pos_x = 50
        pos_y = 250 - 150 if background_type == "video" else 250
        return artifact_clip.with_position((pos_x, pos_y))
    return None


def create_logo_clip(
    bucket_name: str, duration_sec: float
) -> Optional[CompositeVideoClip]:
    """
    Download and resize a logo overlay, then add a thin horizontal line.
    """
    logo_key = "artifacts/Logo.png"
    downloaded_logo = download_s3_file(bucket_name, logo_key, LOCAL_LOGO)
    if not (downloaded_logo and os.path.exists(LOCAL_LOGO)):
        return None

    raw_logo = ImageClip(LOCAL_LOGO)
    scale_logo = 200 / raw_logo.w
    logo_clip = raw_logo.with_effects([vfx.Resize(scale_logo)]).with_duration(
        duration_sec
    )

    line_width_left = 700
    line_height = 4
    line_color = ImageColor.getrgb("#ec008c")

    line_left = ColorClip(
        size=(line_width_left, line_height), color=line_color
    ).with_duration(duration_sec)

    gap = 20
    total_width = line_width_left + gap + logo_clip.w
    total_height = max(line_height, logo_clip.h)

    composite = (
        CompositeVideoClip(
            [
                line_left.with_position((0, (total_height - line_height) // 2)),
                logo_clip.with_position(
                    (line_width_left + gap, (total_height - logo_clip.h) // 2)
                ),
            ],
            size=(total_width, total_height),
        )
        .with_duration(duration_sec)
        .with_position(
            (
                DEFAULT_VIDEO_WIDTH - total_width - 50,
                DEFAULT_VIDEO_HEIGHT - total_height - 100,
            )
        )
    )
    return composite


def create_gradient_clip(
    bucket_name: str, duration_sec: float
) -> Optional[ImageClip]:
    """
    Download and prepare a gradient overlay image.
    """
    gradient_key = "artifacts/Black Gradient.png"
    downloaded = download_s3_file(bucket_name, gradient_key, LOCAL_GRADIENT)
    if downloaded and os.path.exists(LOCAL_GRADIENT):
        return (
            ImageClip(LOCAL_GRADIENT)
            .with_effects(
                [vfx.Resize((DEFAULT_VIDEO_WIDTH, DEFAULT_VIDEO_HEIGHT))]
            )
            .with_duration(duration_sec)
        )
    return None


def create_text_clips(
    title_text: str,
    description_text: str,
    highlight_words_title: Set[str],
    highlight_words_description: Set[str],
    spinning_artifact: str,
    duration_sec: float,
    background_type: str,
) -> list:
    """
    Create text overlay clips (title + optional description).
    """
    clips = []
    width, height = DEFAULT_VIDEO_WIDTH, DEFAULT_VIDEO_HEIGHT

    if description_text:
        if background_type == "video" or spinning_artifact == "TRAILER":
            top_size = dynamic_font_size(title_text, 100, 75, 25)
            sub_size = dynamic_font_size(description_text, 70, 30, 45)
        elif spinning_artifact in ["NEWS", "FACT"]:
            top_size = dynamic_font_size(title_text, 100, 70, 30)
            sub_size = dynamic_font_size(description_text, 70, 25, 45)
        else:
            top_size = dynamic_font_size(title_text, 100, 70, 30)
            sub_size = dynamic_font_size(description_text, 70, 25, 45)

        title_clip = create_multiline_colored_clip(
            title_text,
            highlight_words_title,
            FONT_PATH,
            top_size,
            1000,
            duration=duration_sec,
        )
        sub_clip = create_multiline_colored_clip(
            description_text,
            highlight_words_description,
            SUBTITLE_FONT_PATH,
            sub_size,
            800,
            duration=duration_sec,
        )

        title_w, title_h = title_clip.size
        sub_w, sub_h = sub_clip.size

        if background_type == "video" or spinning_artifact == "TRAILER":
            title_pos = ((width - title_w) // 2, 275)
            sub_pos = ((width - sub_w) // 2, int(height * 0.75))
        else:
            bottom_margin = 300
            gap = 30
            sub_y = height - bottom_margin - sub_h
            title_y = sub_y - gap - title_h
            title_pos = ((width - title_w) // 2, title_y)
            sub_pos = ((width - sub_w) // 2, sub_y)

        clips.extend(
            [
                title_clip.with_position(title_pos),
                sub_clip.with_position(sub_pos),
            ]
        )
    else:
        font_size = dynamic_font_size(title_text, 100, 75, 40)
        title_clip = create_multiline_colored_clip(
            title_text,
            highlight_words_title,
            FONT_PATH,
            font_size,
            1000,
            duration=duration_sec,
        )
        title_w, title_h = title_clip.size
        if background_type == "video" or spinning_artifact == "TRAILER":
            title_pos = ((width - title_w) // 2, 275)
        else:
            title_pos = (
                (width - title_w) // 2,
                height - 300 - title_h,
            )
        clips.append(title_clip.with_position(title_pos))

    return clips


def compose_and_write_final(
    clips_list: list,
    width: int,
    height: int,
    duration_sec: float,
    output_path: str,
):
    """
    Compose the final video from multiple clips and write it to a file.
    """
    final_comp = CompositeVideoClip(clips_list, size=(width, height)).with_duration(
        duration_sec
    )
    final_comp.write_videofile(
        output_path,
        fps=24,
        codec="libx264",
        audio_codec="aac",
        audio=True,
        temp_audiofile="/tmp/temp-audo.m4a",
        remove_temp=True,
        threads=2,
        ffmpeg_params=["-preset", "ultrafast"],
    )
    logger.info("Final video written to %s", output_path)


def upload_video_to_s3(local_path: str, bucket_name: str, s3_key: str) -> bool:
    """
    Upload a local file to S3.
    Returns True if successful, otherwise False.
    """
    try:
        s3.upload_file(
            local_path,
            bucket_name,
            s3_key,
            ExtraArgs={
                "ContentType": "video/mp4",
                "ContentDisposition": 'attachment; filename="complete_post.mp4"',
            },
        )
        logger.info("Uploaded video to s3://%s/%s", bucket_name, s3_key)
        return True
    except Exception as exc:
        logger.error("Failed to upload video to S3: %s", exc)
        return False


def send_task_callback(status: str, video_key: str, message: str = ""):
    token = os.getenv("TASK_TOKEN")
    if not token:
        logger.warning("No TASK_TOKEN supplied; running outside callback?")
        return

    sfn = boto3.client("stepfunctions")
    if status == "success":
        sfn.send_task_success(
            taskToken=token,
            output=json.dumps({"status": status, "video_key": video_key}),
        )
    else:
        sfn.send_task_failure(
            taskToken=token,
            error="RenderError",
            cause=message,
        )


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, str]:
    """
    AWS Lambda handler to render a social‑media video clip.
    """
    logger.info("Render video lambda started")

    timestamp_str = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    folder = f"posts/post_{timestamp_str}"
    complete_key = f"{folder}/complete_post.mp4"

    hl_title, hl_desc = parse_highlight_words(event)
    title_text, description_text = parse_text(event)

    background_type = event.get("backgroundType", "image").lower()
    bg_local_path, downloaded_bg = download_background(event, TARGET_BUCKET)

    spinning_artifact = event.get("spinningArtifact", "").strip().upper()
    artifact_clip = create_artifact_clip(
        spinning_artifact, TARGET_BUCKET, background_type
    )

    bg_clip, duration_sec = create_background_clip(
        bg_local_path,
        downloaded_bg,
        background_type,
        DEFAULT_VIDEO_WIDTH,
        DEFAULT_VIDEO_HEIGHT,
        DEFAULT_DURATION,
    )

    logo_clip = create_logo_clip(TARGET_BUCKET, duration_sec)
    gradient_clip = (
        None
        if background_type == "video"
        else create_gradient_clip(TARGET_BUCKET, duration_sec)
    )

    text_clips = create_text_clips(
        title_text,
        description_text,
        hl_title,
        hl_desc,
        spinning_artifact,
        duration_sec,
        background_type,
    )

    clips_complete = [bg_clip]
    if gradient_clip:
        clips_complete.append(gradient_clip)
    if artifact_clip:
        clips_complete.append(artifact_clip)
    if logo_clip:
        clips_complete.append(logo_clip)
    clips_complete.extend(text_clips)

    compose_and_write_final(
        clips_complete,
        DEFAULT_VIDEO_WIDTH,
        DEFAULT_VIDEO_HEIGHT,
        duration_sec,
        LOCAL_COMPLETE_VIDEO,
    )

    uploaded = upload_video_to_s3(LOCAL_COMPLETE_VIDEO, TARGET_BUCKET, complete_key)
    if not uploaded:
        send_task_callback("error", video_key=complete_key, message="Upload error")
        return {"status": "error", "video_key": complete_key}

    logger.info("Render video complete")
    send_task_callback("success", video_key=complete_key)
    return {"status": "rendered", "video_key": complete_key}


if __name__ == "__main__":
    raw_event = os.getenv("EVENT_JSON", "{}")
    try:
        input_event = json.loads(raw_event)
    except json.JSONDecodeError as exc:
        logger.error("Invalid EVENT_JSON: %s", exc)
        sys.exit(1)

    try:
        result_obj = lambda_handler(input_event, None)
    except Exception:
        logger.exception("Unhandled exception in render_video")
        sys.exit(1)

    logger.info("render_video result: %s", json.dumps(result_obj))
    if not result_obj or result_obj.get("status") == "error":
        sys.exit(1)
