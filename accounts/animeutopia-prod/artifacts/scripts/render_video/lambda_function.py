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

s3 = boto3.client("s3")


def dynamic_font_size(text, max_size, min_size, ideal_length):
    length = len(text)
    if length <= ideal_length:
        return max_size
    factor = (max_size - min_size) / ideal_length
    new_size = max_size - (length - ideal_length) * factor
    return int(new_size) if new_size > min_size else min_size


def lambda_handler(event, context):
    bucket_name = os.environ.get("TARGET_BUCKET", "my-bucket")
    json_key = "most_recent_post.json"
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    folder = f"posts/animeutopia_{timestamp_str}"
    complete_key = f"{folder}/anime_post_complete.mp4"
    no_text_key = f"{folder}/anime_post_no_text.mp4"
    no_bg_key = f"{folder}/anime_post_no_bg.mov"
    no_text_no_bg_key = f"{folder}/anime_post_no_text_no_bg.mov"
    local_json = "/tmp/most_recent_post.json"
    s3.download_file(bucket_name, json_key, local_json)
    with open(local_json, "r", encoding="utf-8") as f:
        post_data = json.load(f)
    title_text = post_data.get("title", "No Title")
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
        bg_clip = (
            ImageClip(bg_local_path)
            .with_effects([vfx.Resize((width, height))])
            .with_duration(duration_sec)
        )
    else:
        bg_clip = (
            ColorClip(size=(width, height), color=(0, 0, 0), duration=duration_sec)
            .with_duration(duration_sec)
        )
    transparent_clip = (
        ImageClip(np.zeros((height, width, 4), dtype="uint8"))
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
        raw_news = VideoFileClip(news_local_path).with_duration(duration_sec)
        scale_news = 200 / raw_news.w
        news_clip = raw_news.with_effects([vfx.Resize(scale_news)])
        news_pos = (10, 10)
    else:
        news_clip = None
    title_font_size = dynamic_font_size(title_text, max_size=60, min_size=30, ideal_length=20)
    subtitle_font_size = dynamic_font_size(description_text, max_size=40, min_size=20, ideal_length=30)
    desc_clip = (
        TextClip(
            txt=description_text,
            fontsize=subtitle_font_size,
            color="yellow",
            font="DejaVu-Sans",
            size=(width, None),
            method="caption",
        )
        .with_duration(duration_sec)
    )
    subtitle_y = height - desc_clip.h - 10
    desc_clip = desc_clip.set_position(("center", subtitle_y))
    title_clip = (
        TextClip(
            txt=title_text,
            fontsize=title_font_size,
            color="white",
            font="DejaVu-Sans",
            size=(width, None),
            method="caption",
        )
        .with_duration(duration_sec)
    )
    title_y = subtitle_y - title_clip.h - 10
    title_clip = title_clip.set_position(("center", title_y))
    if logo_local_path and os.path.exists(logo_local_path):
        raw_logo = ImageClip(logo_local_path)
        scale_logo = 100 / raw_logo.w
        logo_clip = (
            raw_logo.with_effects([vfx.Resize(scale_logo)])
            .with_duration(duration_sec)
        )
        logo_margin = 10
        logo_clip = logo_clip.set_position(
            lambda t: (width - logo_clip.w - logo_margin, height - logo_clip.h - logo_margin)
        )
    else:
        logo_clip = None
    clips_complete = [bg_clip]
    if gradient_clip:
        clips_complete.append(gradient_clip)
    if news_clip:
        clips_complete.append((news_clip, news_pos))
    clips_complete.extend([title_clip, desc_clip])
    if logo_clip:
        clips_complete.append(logo_clip)
    complete_clip = (
        CompositeVideoClip(clips_complete, size=(width, height))
        .with_duration(duration_sec)
    )
    clips_no_text = [bg_clip]
    if gradient_clip:
        clips_no_text.append(gradient_clip)
    if news_clip:
        clips_no_text.append((news_clip, news_pos))
    if logo_clip:
        clips_no_text.append(logo_clip)
    no_text_clip = (
        CompositeVideoClip(clips_no_text, size=(width, height))
        .with_duration(duration_sec)
    )
    clips_no_bg = [transparent_clip]
    if gradient_clip:
        clips_no_bg.append(gradient_clip)
    if news_clip:
        clips_no_bg.append((news_clip, news_pos))
    clips_no_bg.extend([title_clip, desc_clip])
    if logo_clip:
        clips_no_bg.append(logo_clip)
    no_bg_clip = (
        CompositeVideoClip(clips_no_bg, size=(width, height))
        .with_duration(duration_sec)
    )
    clips_no_text_no_bg = [transparent_clip]
    if gradient_clip:
        clips_no_text_no_bg.append(gradient_clip)
    if news_clip:
        clips_no_text_no_bg.append((news_clip, news_pos))
    if logo_clip:
        clips_no_text_no_bg.append(logo_clip)
    no_text_no_bg_clip = (
        CompositeVideoClip(clips_no_text_no_bg, size=(width, height))
        .with_duration(duration_sec)
    )
    complete_local = "/tmp/anime_post_complete.mp4"
    no_text_local = "/tmp/anime_post_no_text.mp4"
    no_bg_local = "/tmp/anime_post_no_bg.mov"
    no_text_no_bg_local = "/tmp/anime_post_no_text_no_bg.mov"
    complete_clip.write_videofile(complete_local, fps=24, codec="libx264", audio=False)
    no_text_clip.write_videofile(no_text_local, fps=24, codec="libx264", audio=False)
    no_bg_clip.write_videofile(no_bg_local, fps=24, codec="png", audio=False)
    no_text_no_bg_clip.write_videofile(no_text_no_bg_local, fps=24, codec="png", audio=False)
    s3.upload_file(complete_local, bucket_name, complete_key)
    s3.upload_file(no_text_local, bucket_name, no_text_key)
    s3.upload_file(no_bg_local, bucket_name, no_bg_key)
    s3.upload_file(no_text_no_bg_local, bucket_name, no_text_no_bg_key)
    return {
        "status": "rendered",
        "video_keys": {
            "complete": complete_key,
            "no_text": no_text_key,
            "no_bg": no_bg_key,
            "no_text_no_bg": no_text_no_bg_key,
        },
    }
