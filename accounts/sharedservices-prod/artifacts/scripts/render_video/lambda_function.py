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

def dynamic_font_size(text, max_size, min_size, ideal_length):
    length = len(text)
    if length <= ideal_length:
        return max_size
    factor = (max_size - min_size) / ideal_length
    new_size = max_size - (length - ideal_length) * factor
    return int(new_size) if new_size > min_size else min_size

def measure_text_width(text, font_path, font_size):
    font = ImageFont.truetype(font_path, font_size)
    bbox = font.getbbox(text)
    width = bbox[2] - bbox[0]
    return width

def dynamic_split(text, font_path, font_size, max_width):
    """
    Splits text into two lines (top_line, bottom_line) so that each 
    portion fits into 'max_width' (if possible).
    """
    if measure_text_width(text, font_path, font_size) <= max_width:
        return text, ""
    words = text.split()
    top_line = ""
    for i in range(1, len(words) + 1):
        candidate = " ".join(words[:i])
        if measure_text_width(candidate, font_path, font_size) <= max_width:
            top_line = candidate
        else:
            break
    bottom_line = " ".join(words[len(top_line.split()):])
    
    # Attempt to balance lines if the second line is much larger
    if len(words) - len(top_line.split()) > len(top_line.split()):
        candidate = " ".join(words[:len(top_line.split()) + 1])
        if measure_text_width(candidate, font_path, font_size) <= max_width:
            top_line = candidate
            bottom_line = " ".join(words[len(top_line.split()):])
    return top_line, bottom_line

def create_colored_line_clip(line_text, highlight_words, font_path, font_size, duration=10, space=10):
    """
    Creates a CompositeVideoClip that contains one TextClip per word. 
    Any word matching (case-insensitive) an entry in highlight_words 
    will be colored #ec008c; otherwise white by default.

    :param line_text: The text for one entire line (already split).
    :param highlight_words: A set of words to highlight, e.g. {'BREAKING', 'NEWS'}.
    :param font_path: Path to the TTF font.
    :param font_size: The font size for all words in this line.
    :param duration: The duration each clip will last (same as background).
    :param space: Horizontal spacing (in px) between words.

    :return: CompositeVideoClip which can be positioned in the final composition.
    """
    words = line_text.split()
    word_clips = []
    x_offset = 0

    for word in words:
        clean_word = word.strip(",.!?;:").upper()

        color = "#ec008c" if clean_word in highlight_words else "white"
        
        txt_clip = TextClip(
            text=word,
            font=font_path,
            fontsize=font_size,
            color=color,
            method="caption"
        ).with_duration(duration)

        txt_clip = txt_clip.with_position((x_offset, 0))

        x_offset += txt_clip.w + space

        word_clips.append(txt_clip)

    if not word_clips:
        return ColorClip((1, 1), color=(0, 0, 0), duration=duration)

    line_height = word_clips[0].h

    line_clip = CompositeVideoClip(word_clips, size=(x_offset, line_height))
    line_clip = line_clip.with_duration(duration)
    return line_clip

def lambda_handler(event, context):
    logger.info("Render video lambda started")
    bucket_name = os.environ.get("TARGET_BUCKET")
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    folder = f"posts/post_{timestamp_str}"
    complete_key = f"{folder}/complete_post.mp4"
    complete_local = "/mnt/efs/complete_post.mp4"

    highlight_words_title_raw = event.get("highlightWordsTitle", "") or ""
    highlight_words_description_raw = event.get("highlightWordsDescription", "") or ""

    highlight_words_title = {
        w.strip().upper() for w in highlight_words_title_raw.split(",") if w.strip()
    }
    highlight_words_description = {
        w.strip().upper() for w in highlight_words_description_raw.split(",") if w.strip()
    }

    post_data = event.get("post_data", {})
    title_text = event.get("title", "").upper()
    description_text = event.get("description", "").upper()
    image_path = event.get("image_path", None)

    logger.info(f"Title: {title_text}, Description: {description_text}, Image Path: {image_path}")
    logger.info(f"HighlightWordsTitle: {highlight_words_title_raw}, HighlightWordsDescription: {highlight_words_description_raw}")

    bg_local_path = "/tmp/backgroundimage_converted.jpg"
    if image_path and image_path.startswith("http"):
        try:
            logger.info("Attempting to download HTTP image")
            resp = requests.get(image_path, timeout=10)
            with open(bg_local_path, "wb") as f:
                f.write(resp.content)
            logger.info("HTTP image downloaded successfully")
        except Exception as e:
            logger.error(f"Error downloading HTTP image: {e}")
            bg_local_path = None
    elif image_path:
        try:
            logger.info("Attempting to download image from S3")
            s3.download_file(bucket_name, image_path, bg_local_path)
            logger.info("S3 image downloaded successfully")
        except Exception as e:
            logger.error(f"Error downloading S3 image: {e}")
            bg_local_path = None

    logo_key = "artifacts/Logo.png"
    logo_local_path = "/tmp/Logo.png"
    try:
        logger.info("Downloading logo from S3")
        s3.download_file(bucket_name, logo_key, logo_local_path)
        logger.info("Logo downloaded")
    except Exception as e:
        logger.error(f"Error downloading logo: {e}")
        logo_local_path = None

    gradient_key = "artifacts/Black Gradient.png"
    gradient_local_path = "/tmp/Black_Gradient.png"
    try:
        logger.info("Downloading gradient from S3")
        s3.download_file(bucket_name, gradient_key, gradient_local_path)
        logger.info("Gradient downloaded")
    except Exception as e:
        logger.error(f"Error downloading gradient: {e}")
        gradient_local_path = None

    news_key = "artifacts/NEWS.mov"
    news_local_path = "/tmp/NEWS.mov"
    try:
        logger.info("Downloading news clip from S3")
        s3.download_file(bucket_name, news_key, news_local_path)
        logger.info("News clip downloaded")
    except Exception as e:
        logger.error(f"Error downloading news clip: {e}")
        news_local_path = None

    width, height = 1080, 1080
    duration_sec = 10

    if bg_local_path and os.path.exists(bg_local_path):
        logger.info("Using background image")
        bg_clip = (
            ImageClip(bg_local_path)
            .with_effects([vfx.Resize((width, height))])
            .with_duration(duration_sec)
        )
    else:
        logger.info("Using default color background")
        bg_clip = (
            ColorClip(size=(width, height), color=(0, 0, 0))
            .with_duration(duration_sec)
        )

    if gradient_local_path and os.path.exists(gradient_local_path):
        gradient_clip = (
            ImageClip(gradient_local_path)
            .with_effects([vfx.Resize((width, height))])
            .with_duration(duration_sec)
        )
    else:
        gradient_clip = None

    if news_local_path and os.path.exists(news_local_path):
        logger.info("Including news clip")
        raw_news = VideoFileClip(news_local_path, has_mask=True).with_duration(duration_sec)
        scale_factor = 300 / raw_news.w
        news_clip = raw_news.with_effects([vfx.Resize(scale_factor)])
    else:
        news_clip = None

    base_margin = 15
    if logo_local_path and os.path.exists(logo_local_path):
        logger.info("Including logo clip")
        raw_logo = ImageClip(logo_local_path)
        scale_logo = 150 / raw_logo.w
        logo_clip = (
            raw_logo.with_effects([vfx.Resize(scale_logo)])
            .with_duration(duration_sec)
        )
        logo_clip = logo_clip.with_position((width - logo_clip.w - base_margin,
                                             height - logo_clip.h - base_margin))
        side_margin = max(logo_clip.w + base_margin, base_margin)
    else:
        logo_clip = None
        side_margin = base_margin

    available_width = width - (2 * side_margin)
    subtitle_side_margin = side_margin + 10
    available_subtitle_width = width - (2 * subtitle_side_margin)

    top_font_size = dynamic_font_size(title_text, max_size=100, min_size=50, ideal_length=20)
    bottom_font_size = top_font_size - 10 if top_font_size - 10 > 0 else top_font_size
    subtitle_font_size = dynamic_font_size(description_text, max_size=50, min_size=25, ideal_length=30)
    subtitle_font_size = min(subtitle_font_size, top_font_size)

    title_top, title_bottom = dynamic_split(title_text, font_path, top_font_size, available_width)
    subtitle_top, subtitle_bottom = dynamic_split(description_text, font_path, subtitle_font_size, available_subtitle_width)

    top_clip = create_colored_line_clip(
        title_top, 
        highlight_words_title, 
        font_path,
        top_font_size,
        duration=duration_sec,
        space=10
    )
    bottom_clip = create_colored_line_clip(
        title_bottom,
        highlight_words_title,
        font_path,
        bottom_font_size,
        duration=duration_sec,
        space=10
    )
    desc_top_clip = create_colored_line_clip(
        subtitle_top,
        highlight_words_description,
        font_path,
        subtitle_font_size,
        duration=duration_sec,
        space=10
    )
    desc_bottom_clip = create_colored_line_clip(
        subtitle_bottom,
        highlight_words_description,
        font_path,
        subtitle_font_size,
        duration=duration_sec,
        space=10
    )

    subtitle_bottom_y = height - 20 - desc_bottom_clip.h
    subtitle_top_y = subtitle_bottom_y - 10 - desc_top_clip.h
    bottom_title_y = subtitle_top_y - 12 - bottom_clip.h
    top_title_y = bottom_title_y - 10 - top_clip.h

    top_clip = top_clip.with_position((side_margin, top_title_y))
    bottom_clip = bottom_clip.with_position((side_margin, bottom_title_y))
    desc_top_clip = desc_top_clip.with_position((subtitle_side_margin, subtitle_top_y))
    desc_bottom_clip = desc_bottom_clip.with_position((subtitle_side_margin, subtitle_bottom_y))

    clips_complete = [bg_clip]
    if gradient_clip:
        clips_complete.append(gradient_clip)
    if news_clip:
        clips_complete.append(news_clip)
    clips_complete.extend([top_clip, bottom_clip, desc_top_clip, desc_bottom_clip])
    if logo_clip:
        clips_complete.append(logo_clip)

    logger.info("Starting final composite video")
    complete_clip = CompositeVideoClip(clips_complete, size=(width, height)).with_duration(duration_sec)

    logger.info("Writing video file")
    complete_clip.write_videofile(complete_local, fps=24, codec="libx264", audio=False)
    logger.info("Uploading final video")
    s3.upload_file(
        complete_local,
        bucket_name,
        complete_key,
        ExtraArgs={
            "ContentType": "video/mp4",
            "ContentDisposition": "attachment; filename=\"complete_post.mp4\""
        }
    )
    logger.info("Render video complete")

    return {
        "status": "rendered",
        "video_key": complete_key
    }
