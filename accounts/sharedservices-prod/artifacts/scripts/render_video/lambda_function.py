import datetime
import json
import logging
import os
from typing import Any, Dict, Set

import boto3
import requests
import moviepy.video.fx as vfx
from moviepy.video.VideoClip import ColorClip, ImageClip, TextClip
from moviepy.video.compositing.CompositeVideoClip import CompositeVideoClip
from moviepy.video.io.VideoFileClip import VideoFileClip
from PIL import ImageFont, Image

logger = logging.getLogger()
logger.setLevel(logging.DEBUG)

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
    try:
        s3.download_file(bucket_name, key, local_path)
        return True
    except Exception as e:
        logger.error(f"S3 download failed for key='{key}' in bucket='{bucket_name}': {e}")
        return False


def download_http_file(url: str, local_path: str, timeout: int = 10) -> bool:
    try:
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()
        with open(local_path, "wb") as f:
            f.write(resp.content)
        return True
    except Exception as e:
        logger.error(f"HTTP image download failed for '{url}': {e}")
        return False


def measure_text_width_pillow(word: str, font_path: str, font_size: int) -> int:
    font = ImageFont.truetype(font_path, font_size)
    bbox = font.getbbox(word)
    width = bbox[2] - bbox[0]
    return width


def dynamic_font_size(text: str, max_size: int, min_size: int, ideal_length: int) -> int:
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
    duration: float = 10
) -> CompositeVideoClip:
    words = full_text.split()
    lines = []
    current_line = []
    current_line_width = 0
    for word in words:
        clean_word = word.strip(",.!?;:").upper()
        w_px = measure_text_width_pillow(word, font_path, font_size)
        extra_needed = w_px + (space if current_line else 0)
        if current_line_width + extra_needed <= max_width:
            current_line.append(word)
            current_line_width += extra_needed
        else:
            lines.append(current_line)
            current_line = [word]
            current_line_width = w_px
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
            text_h = bottom - top
            text_h += 10
            txt_clip = TextClip(
                text=w,
                font=font_path,
                font_size=font_size,
                color=color,
                size=(text_w, text_h),
                method="label"
            ).with_duration(duration)
            txt_clip = txt_clip.with_position((x_offset, 0))
            x_offset += txt_clip.w + space
            word_clips.append(txt_clip)
        if word_clips:
            line_height = word_clips[0].h
            line_width = max(x_offset - space, 1)
            line_composite = CompositeVideoClip(word_clips, size=(line_width, line_height)).with_duration(duration)
            line_clips.append(line_composite)
        else:
            blank = ColorClip((1, 1), color=(0, 0, 0)).with_duration(duration)
            line_clips.append(blank)

    max_line_width = max((lc.size[0] for lc in line_clips), default=1)
    stacked_clips = []
    current_y = 0
    for lc in line_clips:
        lw, lh = lc.size
        line_x = (max_line_width - lw) // 2
        line_pos = lc.with_position((line_x, current_y))
        stacked_clips.append(line_pos)
        current_y += lh + line_spacing
    total_height = max(current_y - line_spacing, 1)
    max_line_width = 1
    for lc in line_clips:
        w, h = lc.size
        if w > max_line_width:
            max_line_width = w
    final_clip = CompositeVideoClip(
        stacked_clips, size=(max_line_width, total_height)
    ).with_duration(duration)
    return final_clip


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, str]:
    logger.info("Render video lambda started")
    bucket_name = TARGET_BUCKET
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    folder = f"posts/post_{timestamp_str}"
    complete_key = f"{folder}/complete_post.mp4"
    highlight_words_title_raw = event.get("highlightWordsTitle", "") or ""
    highlight_words_description_raw = event.get("highlightWordsDescription", "") or ""
    highlight_words_title = {
        w.strip().upper() for w in highlight_words_title_raw.split(",") if w.strip()
    }
    highlight_words_description = {
        w.strip().upper() for w in highlight_words_description_raw.split(",") if w.strip()
    }
    desc_raw = event.get("description")
    if desc_raw and desc_raw.strip().lower() == "none":
        desc_raw = None
    title_text = (event.get("title") or "").upper()
    description_text = desc_raw.upper() if desc_raw else ""
    background_type = event.get("backgroundType", "image").lower()
    if background_type == "video":
        background_path = event.get("video_path", "")
        bg_local_path = LOCAL_BG_VIDEO
    else:
        background_path = event.get("image_path", "")
        bg_local_path = LOCAL_BG_IMAGE
    width, height = DEFAULT_VIDEO_WIDTH, DEFAULT_VIDEO_HEIGHT
    duration_sec = DEFAULT_DURATION
    downloaded_bg = False
    if background_path and background_path.startswith("http"):
        downloaded_bg = download_http_file(background_path, bg_local_path, timeout=10)
    elif background_path:
        downloaded_bg = download_s3_file(bucket_name, background_path, bg_local_path)
    gradient_key = "artifacts/Black Gradient.png"
    gradient_local_path = LOCAL_GRADIENT
    downloaded_gradient = download_s3_file(bucket_name, gradient_key, gradient_local_path)
    spinning_artifact = event.get("spinningArtifact", "").strip().upper()
    news_clip = None
    if spinning_artifact in ["NEWS", "TRAILER"]:
        if spinning_artifact == "NEWS":
            artifact_key = "artifacts/NEWS.mov"
        else:
            artifact_key = "artifacts/TRAILER.mov"
        local_artifact_path = LOCAL_NEWS
        downloaded_artifact = download_s3_file(bucket_name, artifact_key, local_artifact_path)
        if downloaded_artifact and os.path.exists(local_artifact_path):
            raw_clip = VideoFileClip(local_artifact_path, has_mask=True)
            news_clip = vfx.loop(raw_clip, duration=duration_sec)
            scale_factor = 300 / news_clip.w
            news_clip = vfx.resize(news_clip, scale_factor)
    logo_key = "artifacts/Logo.png"
    logo_local_path = LOCAL_LOGO
    downloaded_logo = download_s3_file(bucket_name, logo_key, logo_local_path)
    if downloaded_logo and os.path.exists(logo_local_path):
        raw_logo = ImageClip(logo_local_path)
        scale_logo = 150 / raw_logo.w
        logo_clip = vfx.resize(raw_logo, scale_logo)
        logo_x = width - logo_clip.w
        logo_y = height - logo_clip.h
    else:
        logo_clip = None
    if downloaded_bg and os.path.exists(bg_local_path):
        if background_type == "video":
            raw_bg = VideoFileClip(bg_local_path)
            duration_sec = raw_bg.duration
            if spinning_artifact == "TRAILER":
                scale_factor = width / raw_bg.w
                new_height = int(raw_bg.h * scale_factor)
                black_bg = ColorClip((width, height), color=(0, 0, 0)).with_duration(duration_sec)
                y_offset = (height - new_height) // 2
                scaled_bg = vfx.resize(raw_bg, (width, new_height)).set_position((0, y_offset))
                bg_clip = CompositeVideoClip([black_bg, scaled_bg], size=(width, height)).set_duration(duration_sec)
            else:
                bg_clip = vfx.resize(raw_bg, (width, height)).set_duration(duration_sec)
        else:
            raw_bg = ImageClip(bg_local_path).with_duration(duration_sec)
            bg_clip = vfx.resize(raw_bg, (width, height))
    else:
        bg_clip = ColorClip((width, height), color=(0, 0, 0)).with_duration(duration_sec)
    if downloaded_gradient and os.path.exists(gradient_local_path):
        gradient_base = ImageClip(gradient_local_path).with_duration(duration_sec)
        gradient_clip = vfx.resize(gradient_base, (width, height))
    else:
        gradient_clip = None
    clips_complete = [bg_clip]
    if gradient_clip:
        clips_complete.append(gradient_clip)
    if news_clip:
        clips_complete.append(news_clip)
    if logo_clip:
        logo_clip = logo_clip.with_duration(duration_sec).with_position((logo_x, logo_y))
        clips_complete.append(logo_clip)
    if description_text:
        title_max_width = 850
        subtitle_max_width = 800
        if spinning_artifact == "TRAILER":
            top_font_size = dynamic_font_size(title_text, 70, 50, 25)
            subtitle_font_size = dynamic_font_size(description_text, 60, 30, 45)
        elif spinning_artifact == "NEWS":
            top_font_size = dynamic_font_size(title_text, 80, 50, 20)
            subtitle_font_size = dynamic_font_size(description_text, 50, 25, 45)
        else:
            top_font_size = 70
            subtitle_font_size = 50
        multiline_title_clip = create_multiline_colored_clip(
            title_text,
            highlight_words_title,
            FONT_PATH,
            top_font_size,
            title_max_width,
            "white",
            "#ec008c",
            10,
            10,
            duration_sec
        )
        multiline_subtitle_clip = create_multiline_colored_clip(
            description_text,
            highlight_words_description,
            FONT_PATH,
            subtitle_font_size,
            subtitle_max_width,
            "white",
            "#ec008c",
            10,
            10,
            duration_sec
        )
        title_w, title_h = multiline_title_clip.size
        sub_w, sub_h = multiline_subtitle_clip.size
        bottom_margin = 50
        gap_between_title_and_sub = 20
        if spinning_artifact == "TRAILER":
            title_y = 275
            title_x = (width - title_w) // 2
            single_line_threshold = top_font_size + 10
            if title_h > single_line_threshold:
                title_y += 50
            multiline_title_clip = multiline_title_clip.with_position((title_x, title_y))
            subtitle_y = int(height * 0.75)
            subtitle_x = (width - sub_w) // 2
            multiline_subtitle_clip = multiline_subtitle_clip.with_position((subtitle_x, subtitle_y))
        else:
            subtitle_y = height - bottom_margin - sub_h
            subtitle_x = (width - sub_w) // 2
            multiline_subtitle_clip = multiline_subtitle_clip.with_position((subtitle_x, subtitle_y))
            title_y = subtitle_y - gap_between_title_and_sub - title_h
            title_x = (width - title_w) // 2
            multiline_title_clip = multiline_title_clip.with_position((title_x, title_y))
        clips_complete.append(multiline_title_clip)
        clips_complete.append(multiline_subtitle_clip)
    else:
        title_max_width = 900
        bigger_font_size = dynamic_font_size(title_text, 100, 40, 20)
        multiline_title_clip = create_multiline_colored_clip(
            title_text,
            highlight_words_title,
            FONT_PATH,
            bigger_font_size,
            title_max_width,
            "white",
            "#ec008c",
            10,
            10,
            duration_sec
        )
        title_w, title_h = multiline_title_clip.size
        if spinning_artifact == "TRAILER":
            title_y = 300
            title_x = (width - title_w) // 2
            single_line_threshold = bigger_font_size + 10
            if title_h > single_line_threshold:
                title_y += 50
            multiline_title_clip = multiline_title_clip.with_position((title_x, title_y))
        else:
            bottom_margin = 50
            title_y = height - bottom_margin - title_h
            title_x = (width - title_w) // 2
            multiline_title_clip = multiline_title_clip.with_position((title_x, title_y))
        clips_complete.append(multiline_title_clip)
    final_comp = CompositeVideoClip(clips_complete, size=(width, height)).set_duration(duration_sec)
    final_comp.write_videofile(LOCAL_COMPLETE_VIDEO, fps=24, codec="libx264", audio=False)
    try:
        s3.upload_file(
            LOCAL_COMPLETE_VIDEO,
            bucket_name,
            complete_key,
            ExtraArgs={
                "ContentType": "video/mp4",
                "ContentDisposition": 'attachment; filename="complete_post.mp4"'
            }
        )
    except Exception as e:
        logger.error(f"Failed to upload video to S3: {e}")
        return {
            "status": "error",
            "video_key": complete_key,
            "message": f"Upload error: {str(e)}"
        }
    logger.info("Render video complete")
    return {
        "status": "rendered",
        "video_key": complete_key
    }
