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
    print(f"[dynamic_font_size] Calculating font size for text: '{text}'")
    length = len(text)
    if length <= ideal_length:
        print(f"[dynamic_font_size] Text length <= ideal_length, returning max_size={max_size}")
        return max_size
    factor = (max_size - min_size) / ideal_length
    new_size = max_size - (length - ideal_length) * factor
    final_size = int(new_size) if new_size > min_size else min_size
    print(f"[dynamic_font_size] Computed size={final_size}")
    return final_size

def measure_text_width(text, font_path, font_size):
    print(f"[measure_text_width] Measuring width for text: '{text}', font_size={font_size}")
    font = ImageFont.truetype(font_path, font_size)
    bbox = font.getbbox(text)
    width = bbox[2] - bbox[0]
    print(f"[measure_text_width] Measured width={width}")
    return width

def dynamic_split(text, font_path, font_size, max_width):
    print(f"[dynamic_split] Attempting to split text for max_width={max_width}, font_size={font_size}")
    full_width = measure_text_width(text, font_path, font_size)
    if full_width <= max_width:
        print(f"[dynamic_split] Text fits without splitting. Width={full_width} <= max_width={max_width}")
        return text, ""

    words = text.split()
    top_line = ""
    for i in range(1, len(words) + 1):
        candidate = " ".join(words[:i])
        candidate_width = measure_text_width(candidate, font_path, font_size)
        if candidate_width <= max_width:
            top_line = candidate
        else:
            break

    bottom_line = " ".join(words[len(top_line.split()):])
    print(f"[dynamic_split] Initial top_line='{top_line}' | bottom_line='{bottom_line}'")

    if len(words) - len(top_line.split()) > len(top_line.split()):
        candidate = " ".join(words[:len(top_line.split()) + 1])
        candidate_width = measure_text_width(candidate, font_path, font_size)
        if candidate_width <= max_width:
            top_line = candidate
            bottom_line = " ".join(words[len(top_line.split()):])
            print(f"[dynamic_split] Refined top_line='{top_line}' | bottom_line='{bottom_line}'")

    return top_line, bottom_line

def lambda_handler(event, context):
    print("[lambda_handler] Lambda function started.")
    
    bucket_name = os.environ.get("TARGET_BUCKET")
    print(f"[lambda_handler] Target bucket: {bucket_name}")
    
    json_key = "most_recent_post.json"
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    folder = f"posts/post_{timestamp_str}"
    complete_key = f"{folder}/complete_post.mp4"

    complete_local = "/mnt/efs/complete_post.mp4"
    local_json = "/tmp/most_recent_post.json"

    print(f"[lambda_handler] Downloading JSON file '{json_key}' from bucket '{bucket_name}' to '{local_json}'")
    s3.download_file(bucket_name, json_key, local_json)

    print("[lambda_handler] Loading JSON data")
    with open(local_json, "r", encoding="utf-8") as f:
        post_data = json.load(f)
    print(f"[lambda_handler] post_data: {post_data}")

    title_text = post_data.get("title", "No Title").upper()
    description_text = post_data.get("description", "")
    image_path = post_data.get("image_path", None)

    print(f"[lambda_handler] title_text: {title_text}")
    print(f"[lambda_handler] description_text: {description_text}")
    print(f"[lambda_handler] image_path: {image_path}")

    bg_local_path = "/tmp/backgroundimage_converted.jpg"
    if image_path and image_path.startswith("http"):
        try:
            print(f"[lambda_handler] Downloading image from URL: {image_path}")
            resp = requests.get(image_path, timeout=10)
            with open(bg_local_path, "wb") as f:
                f.write(resp.content)
            print("[lambda_handler] Image downloaded successfully from HTTP")
        except Exception as e:
            print("[lambda_handler] Image download from HTTP failed:", e)
            bg_local_path = None
    elif image_path:
        try:
            print(f"[lambda_handler] Downloading image from S3 path: {image_path}")
            s3.download_file(bucket_name, image_path, bg_local_path)
            print("[lambda_handler] Image downloaded successfully from S3")
        except Exception as e:
            print("[lambda_handler] Failed to download image from S3:", e)
            bg_local_path = None
    else:
        print("[lambda_handler] No valid image_path provided, will use default background.")
        bg_local_path = None

    logo_key = "artifacts/Logo.png"
    logo_local_path = "/tmp/Logo.png"
    try:
        print(f"[lambda_handler] Downloading logo from S3: {logo_key}")
        s3.download_file(bucket_name, logo_key, logo_local_path)
        print("[lambda_handler] Logo downloaded successfully")
    except Exception as e:
        print("[lambda_handler] Failed to download logo:", e)
        logo_local_path = None

    gradient_key = "artifacts/Black Gradient.png"
    gradient_local_path = "/tmp/Black_Gradient.png"
    try:
        print(f"[lambda_handler] Downloading gradient from S3: {gradient_key}")
        s3.download_file(bucket_name, gradient_key, gradient_local_path)
        print("[lambda_handler] Gradient downloaded successfully")
    except Exception as e:
        print("[lambda_handler] Failed to download gradient:", e)
        gradient_local_path = None

    news_key = "artifacts/NEWS.mov"
    news_local_path = "/tmp/NEWS.mov"
    try:
        print(f"[lambda_handler] Downloading NEWS overlay from S3: {news_key}")
        s3.download_file(bucket_name, news_key, news_local_path)
        print("[lambda_handler] NEWS overlay downloaded successfully")
    except Exception as e:
        print("[lambda_handler] Failed to download news video:", e)
        news_local_path = None

    width, height = 1080, 1080
    duration_sec = 10
    print(f"[lambda_handler] Canvas width={width}, height={height}, duration={duration_sec} seconds")

    if bg_local_path and os.path.exists(bg_local_path):
        print(f"[lambda_handler] Creating background clip from local image: {bg_local_path}")
        bg_clip = (
            ImageClip(bg_local_path)
            .with_effects([vfx.Resize((width, height))])
            .with_duration(duration_sec)
        )
    else:
        print("[lambda_handler] No background image found, creating color clip as fallback.")
        bg_clip = (
            ColorClip(size=(width, height), color=(0, 0, 0), duration=duration_sec)
            .with_duration(duration_sec)
        )

    if gradient_local_path and os.path.exists(gradient_local_path):
        print(f"[lambda_handler] Adding gradient overlay: {gradient_local_path}")
        gradient_clip = (
            ImageClip(gradient_local_path)
            .with_effects([vfx.Resize((width, height))])
            .with_duration(duration_sec)
        )
    else:
        print("[lambda_handler] No gradient overlay found.")
        gradient_clip = None

    if news_local_path and os.path.exists(news_local_path):
        print(f"[lambda_handler] Adding NEWS overlay: {news_local_path}")
        raw_news = VideoFileClip(news_local_path, has_mask=True).with_duration(duration_sec)
        scale_factor = 300 / raw_news.w
        print(f"[lambda_handler] NEWS overlay scale_factor={scale_factor}")
        news_clip = raw_news.with_effects([vfx.Resize(scale_factor)])
    else:
        print("[lambda_handler] No NEWS overlay found.")
        news_clip = None

    base_margin = 15
    if logo_local_path and os.path.exists(logo_local_path):
        print(f"[lambda_handler] Adding logo overlay: {logo_local_path}")
        raw_logo = ImageClip(logo_local_path)
        scale_logo = 150 / raw_logo.w
        print(f"[lambda_handler] Logo overlay scale_logo={scale_logo}")
        logo_clip = (
            raw_logo.with_effects([vfx.Resize(scale_logo)])
            .with_duration(duration_sec)
        )
        logo_clip = logo_clip.with_position((width - logo_clip.w - base_margin, 
                                             height - logo_clip.h - base_margin))
        side_margin = max(logo_clip.w + base_margin, base_margin)
    else:
        print("[lambda_handler] No logo found, skipping logo overlay.")
        logo_clip = None
        side_margin = base_margin

    available_width = width - (2 * side_margin)
    subtitle_side_margin = side_margin + 10
    available_subtitle_width = width - (2 * subtitle_side_margin)
    print(f"[lambda_handler] available_width={available_width}, available_subtitle_width={available_subtitle_width}")

    top_font_size = dynamic_font_size(title_text, max_size=100, min_size=50, ideal_length=20)
    print(f"[lambda_handler] Computed top_font_size={top_font_size}")
    bottom_font_size = top_font_size - 10 if top_font_size - 10 > 0 else top_font_size
    print(f"[lambda_handler] Computed bottom_font_size={bottom_font_size}")

    subtitle_font_size = dynamic_font_size(description_text, max_size=50, min_size=25, ideal_length=30)
    subtitle_font_size = min(subtitle_font_size, top_font_size)
    print(f"[lambda_handler] Computed subtitle_font_size={subtitle_font_size}")

    title_top, title_bottom = dynamic_split(title_text.upper(), font_path, top_font_size, available_width)
    print(f"[lambda_handler] title_top='{title_top}', title_bottom='{title_bottom}'")

    subtitle_top, subtitle_bottom = dynamic_split(description_text.upper(), font_path, subtitle_font_size, available_subtitle_width)
    print(f"[lambda_handler] subtitle_top='{subtitle_top}', subtitle_bottom='{subtitle_bottom}'")

    print("[lambda_handler] Creating text clips...")
    top_clip = (
        TextClip(
            text=title_top,
            font_size=top_font_size,
            color="#ec008c",
            font=font_path,
            size=(available_width, None),
            method="caption"
        )
        .with_duration(duration_sec)
    )
    bottom_clip = (
        TextClip(
            text=title_bottom,
            font_size=bottom_font_size,
            color="#ec008c",
            font=font_path,
            size=(available_width, None),
            method="caption"
        )
        .with_duration(duration_sec)
    )
    desc_top_clip = (
        TextClip(
            text=subtitle_top,
            font_size=subtitle_font_size,
            color="white",
            font=font_path,
            size=(available_subtitle_width, None),
            method="caption"
        )
        .with_duration(duration_sec)
    )
    desc_bottom_clip = (
        TextClip(
            text=subtitle_bottom,
            font_size=subtitle_font_size,
            color="white",
            font=font_path,
            size=(available_subtitle_width, None),
            method="caption"
        )
        .with_duration(duration_sec)
    )

    subtitle_bottom_y = height - 20 - desc_bottom_clip.h
    subtitle_top_y = subtitle_bottom_y - 10 - desc_top_clip.h
    bottom_title_y = subtitle_top_y - 12 - bottom_clip.h
    top_title_y = bottom_title_y - 10 - top_clip.h

    print("[lambda_handler] Placing text clips on the canvas...")
    top_clip = top_clip.with_position((side_margin, top_title_y))
    bottom_clip = bottom_clip.with_position((side_margin, bottom_title_y))
    desc_top_clip = desc_top_clip.with_position((subtitle_side_margin, subtitle_top_y))
    desc_bottom_clip = desc_bottom_clip.with_position((subtitle_side_margin, subtitle_bottom_y))

    print("[lambda_handler] Building final composition...")
    clips_complete = [bg_clip]
    if gradient_clip:
        clips_complete.append(gradient_clip)
    if news_clip:
        clips_complete.append(news_clip)
    clips_complete.extend([top_clip, bottom_clip, desc_top_clip, desc_bottom_clip])
    if logo_clip:
        clips_complete.append(logo_clip)

    complete_clip = CompositeVideoClip(clips_complete, size=(width, height)).with_duration(duration_sec)

    print("[lambda_handler] Rendering the final video...")
    complete_clip.write_videofile(complete_local, fps=24, codec="libx264", audio=False)

    print(f"[lambda_handler] Uploading rendered video to S3: {complete_key}")
    s3.upload_file(
        complete_local, 
        bucket_name, 
        complete_key, 
        ExtraArgs={
            "ContentType": "video/mp4",
            "ContentDisposition": "attachment; filename=\"complete_post.mp4\""
        }
    )

    print("[lambda_handler] Lambda processing completed successfully.")
    return {
        "status": "rendered",
        "video_key": complete_key
    }
