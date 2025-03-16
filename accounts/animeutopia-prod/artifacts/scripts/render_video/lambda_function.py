import datetime
import json
import os
import uuid
import numpy as np
import boto3
import requests
from moviepy.video.VideoClip import ColorClip, ImageClip, TextClip
from moviepy.video.compositing.CompositeVideoClip import CompositeVideoClip
from moviepy.video.io.VideoFileClip import VideoFileClip
import moviepy.video.fx as vfx
from PIL import ImageFont, ImageDraw, Image

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

def lambda_handler(event, context):
    bucket_name = os.environ.get("TARGET_BUCKET", "my-bucket")
    json_key = "most_recent_post.json"
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    folder = f"posts/animeutopia_{timestamp_str}"
    complete_key = f"{folder}/anime_post_complete.mp4"

    complete_local = "/mnt/efs/anime_post_complete.mp4"

    local_json = "/tmp/most_recent_post.json"
    s3.download_file(bucket_name, json_key, local_json)
    with open(local_json, "r", encoding="utf-8") as f:
        post_data = json.load(f)

    title_text = post_data.get("title", "No Title").upper()
    description_text = post_data.get("description", "")
    image_path = post_data.get("image_path", None)

    bg_local_path = "/tmp/background.jpg"
    if image_path and image_path.startswith("http"):
        try:
            resp = requests.get(image_path, timeout=10)
            with open(bg_local_path, "wb") as f:
                f.write(resp.content)
        except Exception as e:
            print("Image download failed:", e)
            bg_local_path = None
    elif image_path:
        try:
            s3.download_file(bucket_name, image_path, bg_local_path)
        except Exception as e:
            print("Failed to download image from S3:", e)
            bg_local_path = None

    logo_key = "artifacts/Logo.png"
    logo_local_path = "/tmp/Logo.png"
    try:
        s3.download_file(bucket_name, logo_key, logo_local_path)
    except Exception as e:
        print("Failed to download logo:", e)
        logo_local_path = None

    gradient_key = "artifacts/Black Gradient.png"
    gradient_local_path = "/tmp/Black_Gradient.png"
    try:
        s3.download_file(bucket_name, gradient_key, gradient_local_path)
    except Exception as e:
        print("Failed to download gradient:", e)
        gradient_local_path = None

    news_key = "artifacts/NEWS.mov"
    news_local_path = "/tmp/NEWS.mov"
    try:
        s3.download_file(bucket_name, news_key, news_local_path)
    except Exception as e:
        print("Failed to download news video:", e)
        news_local_path = None

    width, height = 1080, 1080
    duration_sec = 10

    if bg_local_path and os.path.exists(bg_local_path):
        bg_clip = (ImageClip(bg_local_path)
                   .with_effects([vfx.Resize((width, height))])
                   .with_duration(duration_sec))
    else:
        bg_clip = (ColorClip(size=(width, height), color=(0, 0, 0), duration=duration_sec)
                   .with_duration(duration_sec))

    if gradient_local_path and os.path.exists(gradient_local_path):
        gradient_clip = (ImageClip(gradient_local_path)
                         .with_effects([vfx.Resize((width, height))])
                         .with_duration(duration_sec))
    else:
        gradient_clip = None

    if news_local_path and os.path.exists(news_local_path):
        raw_news = VideoFileClip(news_local_path, has_mask=True).with_duration(duration_sec)
        scale_factor = 250 / raw_news.w
        news_clip = raw_news.with_effects([vfx.Resize(scale_factor)])
    else:
        news_clip = None

    base_margin = 15
    if logo_local_path and os.path.exists(logo_local_path):
        raw_logo = ImageClip(logo_local_path)
        scale_logo = 300 / raw_logo.w
        logo_clip = (raw_logo.with_effects([vfx.Resize(scale_logo)])
                     .with_duration(duration_sec))
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
    subtitle_font_size = dynamic_font_size(description_text, max_size=50, min_size=25, ideal_length=30)
    subtitle_font_size = min(subtitle_font_size, top_font_size)

    title_clip = (
        TextClip(
            text=title_text,
            fontsize=top_font_size,
            color="#ec008c",
            fontname=font_path,
            size=(available_width, None),
            method="caption"
        )
        .with_duration(duration_sec)
    )
    title_h = title_clip.h

    desc_clip = (
        TextClip(
            text=description_text,
            fontsize=subtitle_font_size,
            color="white",
            fontname=font_path,
            size=(available_subtitle_width, None), 
            method="caption"
        )
        .with_duration(duration_sec)
    )
    desc_h = desc_clip.h

    desc_bottom_y = height - 20 - desc_h
    desc_clip = desc_clip.with_position((subtitle_side_margin, desc_bottom_y))

    spacing_between = 20
    title_y = desc_bottom_y - spacing_between - title_h
    title_clip = title_clip.with_position((side_margin, title_y))

    clips_complete = [bg_clip]
    if gradient_clip:
        clips_complete.append(gradient_clip)
    if news_clip:
        clips_complete.append(news_clip)
    clips_complete.extend([title_clip, desc_clip])
    if logo_clip:
        clips_complete.append(logo_clip)

    complete_clip = CompositeVideoClip(clips_complete, size=(width, height)).with_duration(duration_sec)

    complete_clip.write_videofile(complete_local, fps=24, codec="libx264", audio=False)
    s3.upload_file(complete_local, bucket_name, complete_key)

    return {
        "status": "rendered",
        "video_key": complete_key
    }
