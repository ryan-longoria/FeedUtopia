import datetime
import logging
import os
from typing import Any, Dict, Set, Tuple, Optional

import boto3
import requests
from moviepy.video.VideoClip import ColorClip, ImageClip, TextClip
from moviepy.video.compositing.CompositeVideoClip import CompositeVideoClip
from moviepy.video.io.VideoFileClip import VideoFileClip
import moviepy.video.fx as vfx
from PIL import ImageFont

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DEFAULT_VIDEO_WIDTH = 1440
DEFAULT_VIDEO_HEIGHT = 1796
DEFAULT_DURATION = 10
FONT_PATH = "/usr/share/fonts/truetype/msttcorefonts/ariblk.ttf"

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
            key, bucket_name, exc
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
        logger.error(
            "HTTP download failed for '%s': %s",
            url, exc
        )
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
    ideal_length: int
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


def create_multiline_colored_clip(
    full_text: str,
    highlight_words: Set[str],
    font_path: str,
    font_size: int,
    max_width: int,
    color_default: str = "white",
    color_highlight: str = "#ec008c",
    space: int = 10,
    line_spacing: int = 10,
    duration: int = 10
) -> CompositeVideoClip:
    """
    Create a multiline TextClip in which certain words are highlighted.
    """
    words = full_text.split()
    lines = []
    current_line = []
    current_line_width = 0

    for word in words:
        word_width = measure_text_width_pillow(word, font_path, font_size)
        extra_needed = word_width + (space if current_line else 0)
        if current_line_width + extra_needed <= max_width:
            current_line.append(word)
            current_line_width += extra_needed
        else:
            lines.append(current_line)
            current_line = [word]
            current_line_width = word_width
    if current_line:
        lines.append(current_line)

    line_clips = []
    for line_words in lines:
        x_offset = 0
        word_clips = []
        for w in line_words:
            clean_w = w.strip(",.!?;:").upper()
            color = color_highlight if clean_w in highlight_words else color_default

            pil_font = ImageFont.truetype(font_path, font_size)
            left, top, right, bottom = pil_font.getbbox(w)
            text_w = right - left
            text_h = (bottom - top) + 10

            txt_clip = TextClip(
                text=w,
                font=font_path,
                font_size=font_size,
                color=color,
                size=(text_w, text_h),
                method="label"
            ).with_duration(duration)
            txt_clip = txt_clip.with_position((x_offset, 0))
            x_offset += text_w + space
            word_clips.append(txt_clip)

        if word_clips:
            line_width = max(x_offset - space, 1)
            line_height = word_clips[0].h
            line_composite = CompositeVideoClip(
                word_clips, size=(line_width, line_height)
            ).with_duration(duration)
            line_clips.append(line_composite)
        else:
            blank = ColorClip((1, 1), color=(0, 0, 0)).with_duration(duration)
            line_clips.append(blank)

    max_line_width = max((clip.size[0] for clip in line_clips), default=1)

    stacked_clips = []
    current_y = 0
    for lc in line_clips:
        lw, lh = lc.size
        line_x = (max_line_width - lw) // 2
        line_pos = lc.with_position((line_x, current_y))
        stacked_clips.append(line_pos)
        current_y += lh + line_spacing

    total_height = max(current_y - line_spacing, 1)
    final_clip = CompositeVideoClip(
        stacked_clips,
        size=(max_line_width, total_height)
    ).with_duration(duration)

    return final_clip


def parse_highlight_words(event: Dict[str, Any]) -> Tuple[Set[str], Set[str]]:
    """
    Parse highlight words from the event.
    """
    highlight_words_title_raw = event.get("highlightWordsTitle", "") or ""
    highlight_words_description_raw = event.get("highlightWordsDescription", "") or ""

    highlight_words_title = {
        w.strip().upper() for w in highlight_words_title_raw.split(",") if w.strip()
    }
    highlight_words_description = {
        w.strip().upper() for w in highlight_words_description_raw.split(",") if w.strip()
    }

    return highlight_words_title, highlight_words_description


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
    bucket_name: str
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
            downloaded_bg = download_s3_file(bucket_name, background_path, bg_local_path)

    return bg_local_path, downloaded_bg


def create_background_clip(
    local_path: str,
    downloaded_bg: bool,
    background_type: str,
    width: int,
    height: int,
    default_duration: int,
    spinning_artifact: str
) -> Tuple[CompositeVideoClip, float]:
    """
    Create and resize a background clip based on whether it's an image or video.
    Returns the clip and the determined duration.
    """
    if downloaded_bg and os.path.exists(local_path):
        if background_type == "video":
            raw_bg = VideoFileClip(local_path, audio=True)
            duration_sec = raw_bg.duration
        else:
            raw_bg = ImageClip(local_path)
            duration_sec = default_duration

        if spinning_artifact == "TRAILER":
            scale_factor = width / raw_bg.w
            new_height = int(raw_bg.h * scale_factor)
            black_bg = ColorClip((width, height), color=(0, 0, 0)).with_duration(duration_sec)
            y_offset = (height - new_height) // 2
            scaled_bg = (
                raw_bg
                .with_effects([vfx.Resize((width, new_height))])
                .with_duration(duration_sec)
                .with_position((0, y_offset))
            )
            bg_clip = CompositeVideoClip([black_bg, scaled_bg], size=(width, height))
            bg_clip = bg_clip.with_duration(duration_sec)
        else:
            bg_clip = (
                raw_bg
                .with_effects([vfx.Resize((width, height))])
                .with_duration(duration_sec)
            )
    else:
        logger.warning("Failed to download background or background path missing.")
        bg_clip = ColorClip((width, height), color=(0, 0, 0)).with_duration(default_duration)
        duration_sec = default_duration

    return bg_clip, duration_sec


def create_artifact_clip(spinning_artifact: str, bucket_name: str) -> Optional[VideoFileClip]:
    """
    Download and prepare the artifact clip (NEWS, TRAILER, or FACT), if requested.
    Returns a moviepy clip or None if not used.
    """
    if spinning_artifact not in ["NEWS", "TRAILER", "FACT"]:
        return None

    if spinning_artifact == "NEWS":
        artifact_key = "artifacts/NEWS.mov"
        scale_target = 300
    elif spinning_artifact == "TRAILER":
        artifact_key = "artifacts/TRAILER.mov"
        scale_target = 500
    elif spinning_artifact == "FACT":
        artifact_key = "artifacts/FACT.mov"
        scale_target = 300

    downloaded_artifact = download_s3_file(bucket_name, artifact_key, LOCAL_NEWS)
    if downloaded_artifact and os.path.exists(LOCAL_NEWS):
        raw_clip = VideoFileClip(LOCAL_NEWS, has_mask=True)
        scale_factor = scale_target / raw_clip.w
        return raw_clip.with_effects([vfx.Resize(scale_factor)]).with_position((0, 0))

    return None


def create_logo_clip(bucket_name: str, duration_sec: float) -> Optional[ImageClip]:
    """
    Download and resize a logo overlay.
    """
    logo_key = "artifacts/Logo.png"
    downloaded_logo = download_s3_file(bucket_name, logo_key, LOCAL_LOGO)
    if downloaded_logo and os.path.exists(LOCAL_LOGO):
        raw_logo = ImageClip(LOCAL_LOGO)
        scale_logo = 200 / raw_logo.w
        logo_clip = raw_logo.with_effects([vfx.Resize(scale_logo)]).with_duration(duration_sec)
        logo_clip = logo_clip.with_position((
            DEFAULT_VIDEO_WIDTH - logo_clip.w, 
            DEFAULT_VIDEO_HEIGHT - logo_clip.h
        ))
        return logo_clip
    return None


def create_gradient_clip(bucket_name: str, duration_sec: float) -> Optional[ImageClip]:
    """
    Download and prepare a gradient overlay image.
    """
    gradient_key = "artifacts/Black Gradient.png"
    downloaded_gradient = download_s3_file(bucket_name, gradient_key, LOCAL_GRADIENT)
    if downloaded_gradient and os.path.exists(LOCAL_GRADIENT):
        return (
            ImageClip(LOCAL_GRADIENT)
            .with_effects([vfx.Resize((DEFAULT_VIDEO_WIDTH, DEFAULT_VIDEO_HEIGHT))])
            .with_duration(duration_sec)
        )
    return None


def create_text_clips(
    title_text: str,
    description_text: str,
    highlight_words_title: Set[str],
    highlight_words_description: Set[str],
    spinning_artifact: str,
    duration_sec: float
) -> list:
    """
    Create text overlay clips (title + optional description) depending
    on the artifact and text presence.
    Returns a list of text CompositeVideoClips.
    """
    clips = []
    width, height = DEFAULT_VIDEO_WIDTH, DEFAULT_VIDEO_HEIGHT

    if description_text:
        if spinning_artifact == "TRAILER":
            top_font_size = dynamic_font_size(title_text, 125, 75, 25)
            subtitle_font_size = dynamic_font_size(description_text, 70, 30, 45)
            title_max_width = 1300
            subtitle_max_width = 1000
        elif spinning_artifact in ["NEWS", "FACT"]:
            top_font_size = dynamic_font_size(title_text, 100, 70, 30)
            subtitle_font_size = dynamic_font_size(description_text, 70, 25, 45)
            title_max_width = 1300
            subtitle_max_width = 100
        else:
            top_font_size = 70
            subtitle_font_size = 50
            title_max_width = 900
            subtitle_max_width = 800

        multiline_title_clip = create_multiline_colored_clip(
            full_text=title_text,
            highlight_words=highlight_words_title,
            font_path=FONT_PATH,
            font_size=top_font_size,
            max_width=title_max_width,
            duration=duration_sec
        )

        multiline_subtitle_clip = create_multiline_colored_clip(
            full_text=description_text,
            highlight_words=highlight_words_description,
            font_path=FONT_PATH,
            font_size=subtitle_font_size,
            max_width=subtitle_max_width,
            duration=duration_sec
        )

        title_w, title_h = multiline_title_clip.size
        sub_w, sub_h = multiline_subtitle_clip.size

        if spinning_artifact == "TRAILER":
            title_x = (width - title_w) // 2
            title_y = 275
            multiline_title_clip = multiline_title_clip.with_position((title_x, title_y))

            subtitle_x = (width - sub_w) // 2
            subtitle_y = int(height * 0.75)
            multiline_subtitle_clip = multiline_subtitle_clip.with_position((subtitle_x, subtitle_y))
        else:
            bottom_margin = 100
            gap_between_title_and_sub = 30

            subtitle_y = height - bottom_margin - sub_h
            subtitle_x = (width - sub_w) // 2
            multiline_subtitle_clip = multiline_subtitle_clip.with_position((subtitle_x, subtitle_y))

            title_y = subtitle_y - gap_between_title_and_sub - title_h
            title_x = (width - title_w) // 2
            multiline_title_clip = multiline_title_clip.with_position((title_x, title_y))

        clips.extend([multiline_title_clip, multiline_subtitle_clip])
    else:
        bigger_font_size = dynamic_font_size(title_text, 125, 75, 40)
        multiline_title_clip = create_multiline_colored_clip(
            full_text=title_text,
            highlight_words=highlight_words_title,
            font_path=FONT_PATH,
            font_size=bigger_font_size,
            max_width=1300,
            duration=duration_sec
        )
        title_w, title_h = multiline_title_clip.size

        if spinning_artifact == "TRAILER":
            title_x = (width - title_w) // 2
            title_y = 500
            multiline_title_clip = multiline_title_clip.with_position((title_x, title_y))
        else:
            bottom_margin = 100
            title_x = (width - title_w) // 2
            title_y = height - bottom_margin - title_h
            multiline_title_clip = multiline_title_clip.with_position((title_x, title_y))

        clips.append(multiline_title_clip)

    return clips


def compose_and_write_final(
    clips_list: list, 
    width: int, 
    height: int,
    duration_sec: float,
    output_path: str
):
    """
    Compose the final video from multiple clips and write it to a file.
    """
    final_comp = CompositeVideoClip(
        clips_list, size=(width, height)
    ).with_duration(duration_sec)

    final_comp.write_videofile(
        output_path,
        fps=24,
        codec="libx264",
        audio_codec="aac",
        audio=True,
        temp_audiofile="/tmp/temp-audo.m4a",
        remove_temp=True,
        threads=2,
        ffmpeg_params=["-preset", "ultrafast"]
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
                "ContentDisposition": 'attachment; filename="complete_post.mp4"'
            }
        )
        logger.info("Uploaded video to s3://%s/%s", bucket_name, s3_key)
        return True
    except Exception as exc:
        logger.error("Failed to upload video to S3: %s", exc)
        return False


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, str]:
    """
    AWS Lambda handler to render a short social-media video clip based on:
      - a background image or video
      - spinning artifacts
      - text overlays
    """
    logger.info("Render video lambda started")

    timestamp_str = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    folder = f"posts/post_{timestamp_str}"
    complete_key = f"{folder}/complete_post.mp4"

    highlight_words_title, highlight_words_description = parse_highlight_words(event)

    title_text, description_text = parse_text(event)

    background_type = event.get("backgroundType", "image").lower()
    bg_local_path, downloaded_bg = download_background(event, TARGET_BUCKET)

    spinning_artifact = event.get("spinningArtifact", "").strip().upper()
    artifact_clip = create_artifact_clip(spinning_artifact, TARGET_BUCKET)

    bg_clip, duration_sec = create_background_clip(
        local_path=bg_local_path,
        downloaded_bg=downloaded_bg,
        background_type=background_type,
        width=DEFAULT_VIDEO_WIDTH,
        height=DEFAULT_VIDEO_HEIGHT,
        default_duration=DEFAULT_DURATION,
        spinning_artifact=spinning_artifact
    )

    logo_clip = create_logo_clip(TARGET_BUCKET, duration_sec)

    gradient_clip = create_gradient_clip(TARGET_BUCKET, duration_sec)

    text_clips = create_text_clips(
        title_text,
        description_text,
        highlight_words_title,
        highlight_words_description,
        spinning_artifact,
        duration_sec
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
        clips_list=clips_complete,
        width=DEFAULT_VIDEO_WIDTH,
        height=DEFAULT_VIDEO_HEIGHT,
        duration_sec=duration_sec,
        output_path=LOCAL_COMPLETE_VIDEO
    )

    uploaded = upload_video_to_s3(LOCAL_COMPLETE_VIDEO, TARGET_BUCKET, complete_key)
    if not uploaded:
        return {
            "status": "error",
            "video_key": complete_key,
            "message": "Upload error."
        }

    logger.info("Render video complete")

    return {
        "status": "rendered",
        "video_key": complete_key
    }
