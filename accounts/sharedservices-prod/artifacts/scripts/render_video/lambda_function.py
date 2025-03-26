import datetime
import json
import os
import uuid
import logging
import numpy as np
import boto3
import requests
from moviepy.video.VideoClip import ColorClip, ImageClip, TextClip
from moviepy.video.compositing.CompositeVideoClip import CompositeVideoClip
from moviepy.video.io.VideoFileClip import VideoFileClip
import moviepy.video.fx as vfx
from PIL import ImageFont, ImageDraw, Image

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")
font_path = "/usr/share/fonts/truetype/msttcorefonts/ariblk.ttf"

def measure_text_width_pillow(word, font_path, font_size):
    font = ImageFont.truetype(font_path, font_size)
    bbox = font.getbbox(word)
    width = bbox[2] - bbox[0]
    return width

def dynamic_font_size(text, max_size, min_size, ideal_length):
    length = len(text)
    if length <= ideal_length:
        return max_size
    factor = (max_size - min_size) / ideal_length
    new_size = max_size - (length - ideal_length) * factor
    return int(new_size) if new_size > min_size else min_size

def create_multiline_colored_clip(
    full_text: str,
    highlight_words: set,
    font_path: str,
    font_size: int,
    max_width: int,
    color_default="white",
    color_highlight="#ec008c",
    space=10,
    line_spacing=10,
    duration=10
):
    words = full_text.split()
    lines = []
    current_line = []
    current_line_width = 0

    # 1) Build line by line
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

    # 2) Turn each line into a horizontal CompositeVideoClip
    line_clips = []
    for line_words in lines:
        x_offset = 0
        word_clips = []
        for w in line_words:
            clean_w = w.strip(",.!?;:").upper()
            color = color_highlight if clean_w in highlight_words else color_default

            txt_clip = (
                TextClip(
                    text=w,
                    font=font_path,
                    font_size=font_size,
                    color=color
                )
                .with_duration(duration)
            )
            txt_clip = txt_clip.with_position((x_offset, 0))
            x_offset += txt_clip.w + space
            word_clips.append(txt_clip)

        if word_clips:
            line_height = word_clips[0].h
            line_width = max(x_offset - space, 1)
            line_composite = CompositeVideoClip(
                word_clips, size=(line_width, line_height)
            ).with_duration(duration)
            line_clips.append(line_composite)
        else:
            blank = ColorClip((1, 1), color=(0, 0, 0)).with_duration(duration)
            line_clips.append(blank)

    # 3) Stack these line clips vertically
    stacked_clips = []
    current_y = 0
    for lc in line_clips:
        lw, lh = lc.size
        line_pos = lc.with_position((0, current_y))
        stacked_clips.append(line_pos)
        current_y += lh + line_spacing

    # Remove the last extra spacing
    if stacked_clips:
        current_y -= line_spacing
    total_height = max(current_y, 1)

    max_line_width = 1
    for lc in line_clips:
        w, h = lc.size
        if w > max_line_width:
            max_line_width = w

    final_clip = CompositeVideoClip(
        stacked_clips, size=(max_line_width, total_height)
    ).with_duration(duration)

    return final_clip

def lambda_handler(event, context):
    logger.info("Render video lambda started")

    bucket_name = os.environ.get("TARGET_BUCKET", "my-bucket")
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    folder = f"posts/post_{timestamp_str}"
    complete_key = f"{folder}/complete_post.mp4"
    complete_local = "/mnt/efs/complete_post.mp4"

    # 1) Extract fields
    highlight_words_title_raw = event.get("highlightWordsTitle", "") or ""
    highlight_words_description_raw = event.get("highlightWordsDescription", "") or ""

    highlight_words_title = {
        w.strip().upper() for w in highlight_words_title_raw.split(",") if w.strip()
    }
    highlight_words_description = {
        w.strip().upper() for w in highlight_words_description_raw.split(",") if w.strip()
    }

    title_text = (event.get("title") or "").upper()
    description_text = (event.get("description") or "").upper()
    image_path = event.get("image_path", None)

    width, height = 1080, 1080
    duration_sec = 10

    # 2) Download or set background
    bg_local_path = "/tmp/backgroundimage_converted.jpg"
    if image_path and image_path.startswith("http"):
        try:
            resp = requests.get(image_path, timeout=10)
            with open(bg_local_path, "wb") as f:
                f.write(resp.content)
        except Exception as e:
            logger.error(f"HTTP image download failed: {e}")
            bg_local_path = None
    elif image_path:
        try:
            s3.download_file(bucket_name, image_path, bg_local_path)
        except Exception as e:
            logger.error(f"S3 image download failed: {e}")
            bg_local_path = None

    if bg_local_path and os.path.exists(bg_local_path):
        bg_clip = (ImageClip(bg_local_path)
                   .with_effects([vfx.Resize((width, height))])
                   .with_duration(duration_sec))
    else:
        bg_clip = ColorClip((width, height), color=(0, 0, 0)).with_duration(duration_sec)

    # 3) Download / place gradient
    gradient_key = "artifacts/Black Gradient.png"
    gradient_local_path = "/tmp/Black_Gradient.png"
    try:
        s3.download_file(bucket_name, gradient_key, gradient_local_path)
    except Exception as e:
        logger.error(f"Gradient download failed: {e}")
        gradient_local_path = None

    if gradient_local_path and os.path.exists(gradient_local_path):
        gradient_clip = (ImageClip(gradient_local_path)
                         .with_effects([vfx.Resize((width, height))])
                         .with_duration(duration_sec))
    else:
        gradient_clip = None

    # 4) Download NEWS clip
    news_key = "artifacts/NEWS.mov"
    news_local_path = "/tmp/NEWS.mov"
    try:
        s3.download_file(bucket_name, news_key, news_local_path)
    except Exception as e:
        logger.error(f"News clip download failed: {e}")
        news_local_path = None

    if news_local_path and os.path.exists(news_local_path):
        raw_news = VideoFileClip(news_local_path, has_mask=True).with_duration(duration_sec)
        scale_factor = 300 / raw_news.w
        news_clip = raw_news.with_effects([vfx.Resize(scale_factor)])
    else:
        news_clip = None

    # 5) Download and place the logo in the bottom-right corner, no margin
    logo_key = "artifacts/Logo.png"
    logo_local_path = "/tmp/Logo.png"
    try:
        s3.download_file(bucket_name, logo_key, logo_local_path)
    except Exception as e:
        logger.error(f"Logo download failed: {e}")
        logo_local_path = None

    if logo_local_path and os.path.exists(logo_local_path):
        raw_logo = ImageClip(logo_local_path)
        scale_logo = 150 / raw_logo.w
        logo_clip = (
            raw_logo.with_effects([vfx.Resize(scale_logo)])
            .with_duration(duration_sec)
        )
        # Position at bottom-right, with no margin
        logo_x = width - logo_clip.w
        logo_y = height - logo_clip.h
        logo_clip = logo_clip.with_position((logo_x, logo_y))
    else:
        logo_clip = None

    # 6) Build multi-line text (title + subtitle) near the bottom center
    title_max_width = 900
    subtitle_max_width = 900

    top_font_size = dynamic_font_size(title_text, max_size=80, min_size=30, ideal_length=20)
    subtitle_font_size = dynamic_font_size(description_text, max_size=60, min_size=25, ideal_length=30)

    multiline_title_clip = create_multiline_colored_clip(
        full_text=title_text,
        highlight_words=highlight_words_title,
        font_path=font_path,
        font_size=top_font_size,
        max_width=title_max_width,
        color_default="white",
        color_highlight="#ec008c",
        space=10,
        line_spacing=10,
        duration=duration_sec
    )

    multiline_subtitle_clip = create_multiline_colored_clip(
        full_text=description_text,
        highlight_words=highlight_words_description,
        font_path=font_path,
        font_size=subtitle_font_size,
        max_width=subtitle_max_width,
        color_default="white",
        color_highlight="#ec008c",
        space=10,
        line_spacing=10,
        duration=duration_sec
    )

    title_w, title_h = multiline_title_clip.size
    sub_w, sub_h = multiline_subtitle_clip.size

    bottom_margin = 50
    gap_between_title_and_sub = 20

    # Place subtitle bottom at (height - bottom_margin)
    subtitle_y = height - bottom_margin - sub_h
    subtitle_x = (width - sub_w) // 2
    multiline_subtitle_clip = multiline_subtitle_clip.with_position((subtitle_x, subtitle_y))

    # Title above the subtitle
    title_y = subtitle_y - gap_between_title_and_sub - title_h
    title_x = (width - title_w) // 2
    multiline_title_clip = multiline_title_clip.with_position((title_x, title_y))

    # 7) Combine all clips
    clips_complete = [bg_clip]
    if gradient_clip:
        clips_complete.append(gradient_clip)
    if news_clip:
        clips_complete.append(news_clip)
    if logo_clip:
        clips_complete.append(logo_clip)
    # add text last so it's on top
    clips_complete.append(multiline_title_clip)
    clips_complete.append(multiline_subtitle_clip)

    final_comp = CompositeVideoClip(clips_complete, size=(width, height)).with_duration(duration_sec)

    # 8) Write and upload
    final_comp.write_videofile(complete_local, fps=24, codec="libx264", audio=False)

    s3.upload_file(
        complete_local,
        bucket_name,
        complete_key,
        ExtraArgs={
            "ContentType": "video/mp4",
            "ContentDisposition": 'attachment; filename="complete_post.mp4"'
        }
    )

    logger.info("Render video complete")

    return {
        "status": "rendered",
        "video_key": complete_key
    }
