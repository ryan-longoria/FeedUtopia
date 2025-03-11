import json
import os
import uuid

import boto3
import requests
from moviepy.editor import (ColorClip, CompositeVideoClip, ImageClip,
                            TextClip, VideoFileClip)

s3 = boto3.client("s3")


def lambda_handler(event, context):
    bucket_name = os.environ.get("TARGET_BUCKET", "my-bucket")
    json_key = "most_recent_post.json"
    output_key = f"posts/anime_post_{uuid.uuid4().hex}.mp4"

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
            .resize((width, height))
            .set_duration(duration_sec)
        )
    else:
        bg_clip = ColorClip(size=(width, height), color=(0, 0, 0)).set_duration(
            duration_sec
        )

    if gradient_local_path and os.path.exists(gradient_local_path):
        gradient_clip = (
            ImageClip(gradient_local_path)
            .resize((width, height))
            .set_duration(duration_sec)
        )
    else:
        gradient_clip = None

    if news_local_path and os.path.exists(news_local_path):
        news_clip = (
            VideoFileClip(news_local_path)
            .set_duration(duration_sec)
            .resize(width=200)
        )
        news_margin = 10
        news_clip = news_clip.set_position((news_margin, news_margin))
    else:
        news_clip = None

    title_clip = (
        TextClip(
            txt=title_text,
            fontsize=60,
            color="white",
            size=(width, None),
            method="caption",
        )
        .set_duration(duration_sec)
        .set_position(("center", "top"))
    )

    desc_clip = (
        TextClip(
            txt=description_text,
            fontsize=40,
            color="yellow",
            size=(width, None),
            method="caption",
        )
        .set_duration(duration_sec)
        .set_position(("center", "center"))
    )

    clips = [bg_clip]
    if gradient_clip:
        clips.append(gradient_clip)
    if news_clip:
        clips.append(news_clip)
    clips.extend([title_clip, desc_clip])

    if logo_local_path and os.path.exists(logo_local_path):
        logo_clip = (
            ImageClip(logo_local_path)
            .set_duration(duration_sec)
            .resize(width=100)
        )
        logo_margin = 10
        logo_clip = logo_clip.set_position(
            lambda t: (
                width - logo_clip.w - logo_margin,
                height - logo_clip.h - logo_margin,
            )
        )
        clips.append(logo_clip)

    final_clip = CompositeVideoClip(clips, size=(width, height)).set_duration(
        duration_sec
    )
    local_mp4 = "/tmp/anime_post.mp4"
    final_clip.write_videofile(
        local_mp4, fps=24, codec="libx264", audio=False
    )
    s3.upload_file(local_mp4, bucket_name, output_key)
    return {"status": "rendered", "video_s3_key": output_key}
