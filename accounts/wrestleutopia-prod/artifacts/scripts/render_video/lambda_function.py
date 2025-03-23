import os
import json
import datetime
import logging
import requests
import boto3

from dataclasses import dataclass
from typing import Tuple, Optional

from moviepy.video.VideoClip import ColorClip, ImageClip, TextClip
from moviepy.video.compositing.CompositeVideoClip import CompositeVideoClip
from moviepy.video.io.VideoFileClip import VideoFileClip
import moviepy.video.fx as vfx
from PIL import ImageFont, ImageDraw, Image


logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")

FONT_PATH = "/usr/share/fonts/truetype/msttcorefonts/ariblk.ttf"

CANVAS_WIDTH = 1080
CANVAS_HEIGHT = 1080
VIDEO_DURATION_SEC = 10

JSON_KEY = "most_recent_post.json"
LOGO_KEY = "artifacts/Logo.png"
GRADIENT_KEY = "artifacts/Black Gradient.png"
NEWS_KEY = "artifacts/NEWS.mov"


@dataclass
class VideoConfig:
    """
    Configuration options for the final video clip.
    """
    width: int = CANVAS_WIDTH
    height: int = CANVAS_HEIGHT
    duration_sec: int = VIDEO_DURATION_SEC
    font_path: str = FONT_PATH


def dynamic_font_size(
    text: str,
    max_size: int,
    min_size: int,
    ideal_length: int
) -> int:
    """
    Determine the appropriate font size based on the length of the text.

    Args:
        text (str): The text for which to compute the font size.
        max_size (int): The maximum allowed font size.
        min_size (int): The minimum allowed font size.
        ideal_length (int): The length threshold at which the max_size is used.

    Returns:
        int: The computed font size, within the min and max bounds.
    """
    logger.info("[dynamic_font_size] Calculating font size for text: '%s'", text)
    length = len(text)
    if length <= ideal_length:
        logger.info(
            "[dynamic_font_size] Length <= ideal_length; using max_size=%d", max_size
        )
        return max_size

    factor = (max_size - min_size) / ideal_length
    new_size = max_size - (length - ideal_length) * factor
    final_size = int(new_size) if new_size > min_size else min_size
    logger.info("[dynamic_font_size] Computed size=%d", final_size)
    return final_size


def measure_text_width(
    text: str,
    font_path: str,
    font_size: int
) -> int:
    """
    Measure the pixel width of the given text using the specified font.

    Args:
        text (str): The text to measure.
        font_path (str): Path to the .ttf font file.
        font_size (int): The font size to use for measurement.

    Returns:
        int: The width of the text in pixels.
    """
    logger.info(
        "[measure_text_width] Measuring width for text: '%s', font_size=%d",
        text,
        font_size
    )
    font = ImageFont.truetype(font_path, font_size)
    bbox = font.getbbox(text)
    width = bbox[2] - bbox[0]
    logger.info("[measure_text_width] Measured width=%d", width)
    return width


def dynamic_split(
    text: str,
    font_path: str,
    font_size: int,
    max_width: int
) -> Tuple[str, str]:
    """
    Split a text string into two lines if needed, ensuring the width of each
    line does not exceed max_width.

    Args:
        text (str): The text to split.
        font_path (str): Path to the .ttf font file.
        font_size (int): The font size used in measurement.
        max_width (int): The maximum allowed width in pixels for the text.

    Returns:
        tuple[str, str]: A tuple of (top_line, bottom_line).
    """
    logger.info(
        "[dynamic_split] Attempting to split text for max_width=%d, font_size=%d",
        max_width,
        font_size
    )
    full_width = measure_text_width(text, font_path, font_size)
    if full_width <= max_width:
        logger.info(
            "[dynamic_split] Text fits without splitting. Width=%d <= max_width=%d",
            full_width,
            max_width
        )
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
    logger.info(
        "[dynamic_split] Initial top_line='%s' | bottom_line='%s'",
        top_line,
        bottom_line
    )

    if len(words) - len(top_line.split()) > len(top_line.split()):
        candidate = " ".join(words[:len(top_line.split()) + 1])
        candidate_width = measure_text_width(candidate, font_path, font_size)
        if candidate_width <= max_width:
            top_line = candidate
            bottom_line = " ".join(words[len(top_line.split()):])
            logger.info(
                "[dynamic_split] Refined top_line='%s' | bottom_line='%s'",
                top_line,
                bottom_line
            )

    return top_line, bottom_line


def download_resource(bucket_name: str, resource_path: str, local_path: str) -> bool:
    """
    Download a resource either from an HTTP URL or from S3 into local_path.
    Returns True if successful.

    Args:
        bucket_name (str): S3 bucket name (only used if resource_path is not
            an HTTP link).
        resource_path (str): The resource path (URL or S3 key).
        local_path (str): Local filepath destination.

    Returns:
        bool: True if the resource was downloaded successfully, False otherwise.
    """
    if resource_path.startswith("http"):
        try:
            logger.info("[download_resource] Downloading from URL: %s", resource_path)
            resp = requests.get(resource_path, timeout=10)
            with open(local_path, "wb") as f:
                f.write(resp.content)
            logger.info(
                "[download_resource] HTTP download successful: %s",
                resource_path
            )
            return True
        except Exception as e:
            logger.error("[download_resource] HTTP download failed: %s", e)
            return False
    else:
        try:
            logger.info(
                "[download_resource] Downloading from S3 key: %s",
                resource_path
            )
            s3.download_file(bucket_name, resource_path, local_path)
            logger.info("[download_resource] S3 download successful: %s", resource_path)
            return True
        except Exception as e:
            logger.error(
                "[download_resource] S3 download failed for '%s': %s",
                resource_path,
                e
            )
            return False


def download_json(bucket_name: str, json_key: str, local_json: str) -> dict:
    """
    Download a JSON file from S3 and return its contents as a dictionary.

    Args:
        bucket_name (str): Name of the S3 bucket.
        json_key (str): Key of the JSON file in the S3 bucket.
        local_json (str): Local path to save the JSON file.

    Returns:
        dict: The loaded JSON data.
    """
    logger.info("[download_json] Downloading JSON: %s", json_key)
    s3.download_file(bucket_name, json_key, local_json)
    logger.info("[download_json] JSON downloaded, now loading...")
    with open(local_json, "r", encoding="utf-8") as f:
        return json.load(f)


def create_final_clip(
    post_data: dict,
    local_paths: dict,
    config: VideoConfig
) -> CompositeVideoClip:
    """
    Create the final CompositeVideoClip based on the post_data and local paths
    to downloaded resources. Keeps the same MoviePy logic intact.

    Args:
        post_data (dict): Parsed data from the downloaded JSON.
        local_paths (dict): Contains keys like 'background', 'logo', 'gradient',
            'news'.
        config (VideoConfig): Configuration object with video settings.

    Returns:
        CompositeVideoClip: The composed final clip ready to be written to file.
    """
    logger.info("[create_final_clip] Building the video composition...")

    title_text = post_data.get("title", "No Title").upper()
    description_text = post_data.get("description", "")

    width = config.width
    height = config.height
    duration_sec = config.duration_sec

    bg_local_path = local_paths.get("background")
    if bg_local_path and os.path.exists(bg_local_path):
        logger.info(
            "[create_final_clip] Creating background clip from %s",
            bg_local_path
        )
        bg_clip = (
            ImageClip(bg_local_path)
            .with_effects([vfx.Resize((width, height))])
            .with_duration(duration_sec)
        )
    else:
        logger.info("[create_final_clip] Using color clip as fallback background.")
        bg_clip = (
            ColorClip(size=(width, height), color=(0, 0, 0), duration=duration_sec)
            .with_duration(duration_sec)
        )

    gradient_local_path = local_paths.get("gradient")
    if gradient_local_path and os.path.exists(gradient_local_path):
        logger.info(
            "[create_final_clip] Adding gradient overlay: %s",
            gradient_local_path
        )
        gradient_clip = (
            ImageClip(gradient_local_path)
            .with_effects([vfx.Resize((width, height))])
            .with_duration(duration_sec)
        )
    else:
        gradient_clip = None

    news_local_path = local_paths.get("news")
    if news_local_path and os.path.exists(news_local_path):
        logger.info("[create_final_clip] Adding NEWS overlay: %s", news_local_path)
        raw_news = VideoFileClip(news_local_path, has_mask=True).with_duration(
            duration_sec
        )
        scale_factor = 300 / raw_news.w
        news_clip = raw_news.with_effects([vfx.Resize(scale_factor)])
    else:
        news_clip = None

    base_margin = 15
    logo_local_path = local_paths.get("logo")
    if logo_local_path and os.path.exists(logo_local_path):
        logger.info("[create_final_clip] Adding logo overlay: %s", logo_local_path)
        raw_logo = ImageClip(logo_local_path)
        scale_logo = 150 / raw_logo.w
        logo_clip = (
            raw_logo.with_effects([vfx.Resize(scale_logo)]).with_duration(duration_sec)
        )
        logo_clip = logo_clip.with_position(
            (width - logo_clip.w - base_margin, height - logo_clip.h - base_margin)
        )
        side_margin = max(logo_clip.w + base_margin, base_margin)
    else:
        logger.info("[create_final_clip] No logo found; skipping logo overlay.")
        logo_clip = None
        side_margin = base_margin

    available_width = width - (2 * side_margin)
    subtitle_side_margin = side_margin + 10
    available_subtitle_width = width - (2 * subtitle_side_margin)

    logger.info(
        "[create_final_clip] available_width=%d, available_subtitle_width=%d",
        available_width,
        available_subtitle_width
    )

    top_font_size = dynamic_font_size(title_text, max_size=100, min_size=50, ideal_length=20)
    bottom_font_size = top_font_size - 10 if top_font_size - 10 > 0 else top_font_size
    subtitle_font_size = dynamic_font_size(
        description_text, max_size=50, min_size=25, ideal_length=30
    )
    subtitle_font_size = min(subtitle_font_size, top_font_size)

    title_top, title_bottom = dynamic_split(
        title_text.upper(), config.font_path, top_font_size, available_width
    )
    subtitle_top, subtitle_bottom = dynamic_split(
        description_text.upper(), config.font_path, subtitle_font_size,
        available_subtitle_width
    )

    top_clip = (
        TextClip(
            text=title_top,
            font_size=top_font_size,
            color="#ec008c",
            font=config.font_path,
            size=(available_width, None),
            method="caption"
        ).with_duration(duration_sec)
    )
    bottom_clip = (
        TextClip(
            text=title_bottom,
            font_size=bottom_font_size,
            color="#ec008c",
            font=config.font_path,
            size=(available_width, None),
            method="caption"
        ).with_duration(duration_sec)
    )
    desc_top_clip = (
        TextClip(
            text=subtitle_top,
            font_size=subtitle_font_size,
            color="white",
            font=config.font_path,
            size=(available_subtitle_width, None),
            method="caption"
        ).with_duration(duration_sec)
    )
    desc_bottom_clip = (
        TextClip(
            text=subtitle_bottom,
            font_size=subtitle_font_size,
            color="white",
            font=config.font_path,
            size=(available_subtitle_width, None),
            method="caption"
        ).with_duration(duration_sec)
    )

    subtitle_bottom_y = height - 20 - desc_bottom_clip.h
    subtitle_top_y = subtitle_bottom_y - 10 - desc_top_clip.h
    bottom_title_y = subtitle_top_y - 12 - bottom_clip.h
    top_title_y = bottom_title_y - 10 - top_clip.h

    top_clip = top_clip.with_position((side_margin, top_title_y))
    bottom_clip = bottom_clip.with_position((side_margin, bottom_title_y))
    desc_top_clip = desc_top_clip.with_position((subtitle_side_margin, subtitle_top_y))
    desc_bottom_clip = desc_bottom_clip.with_position(
        (subtitle_side_margin, subtitle_bottom_y)
    )

    clips_complete = [bg_clip]
    if gradient_clip:
        clips_complete.append(gradient_clip)
    if news_clip:
        clips_complete.append(news_clip)
    clips_complete.extend([top_clip, bottom_clip, desc_top_clip, desc_bottom_clip])
    if logo_clip:
        clips_complete.append(logo_clip)

    complete_clip = CompositeVideoClip(
        clips_complete, size=(width, height)
    ).with_duration(duration_sec)

    return complete_clip


def lambda_handler(event, context):
    """
    AWS Lambda handler function. Downloads JSON metadata from S3, generates a
    video using MoviePy, and uploads the final result back to S3.

    Args:
        event (dict): AWS Lambda event data (unused in this function).
        context: AWS Lambda context object (unused here).

    Returns:
        dict: Contains the status of the render and the S3 key of the video.
    """
    logger.info("[lambda_handler] Lambda function started.")

    bucket_name = os.environ.get("TARGET_BUCKET")
    logger.info("[lambda_handler] Target bucket: %s", bucket_name)

    timestamp_str = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    folder = f"posts/post_{timestamp_str}"
    complete_key = f"{folder}/complete_post.mp4"

    complete_local = "/mnt/efs/complete_post.mp4"
    local_json = "/tmp/most_recent_post.json"
    bg_local_path = "/tmp/backgroundimage_converted.jpg"
    logo_local_path = "/tmp/Logo.png"
    gradient_local_path = "/tmp/Black_Gradient.png"
    news_local_path = "/tmp/NEWS.mov"

    post_data = download_json(bucket_name, JSON_KEY, local_json)
    logger.info("[lambda_handler] post_data loaded: %s", post_data)

    image_path = post_data.get("image_path", None)
    if image_path:
        success_bg = download_resource(bucket_name, image_path, bg_local_path)
        if not success_bg:
            bg_local_path = None
    else:
        logger.info(
            "[lambda_handler] No valid image_path provided; using default background."
        )
        bg_local_path = None

    success_logo = download_resource(bucket_name, LOGO_KEY, logo_local_path)
    if not success_logo:
        logo_local_path = None

    success_gradient = download_resource(bucket_name, GRADIENT_KEY, gradient_local_path)
    if not success_gradient:
        gradient_local_path = None

    success_news = download_resource(bucket_name, NEWS_KEY, news_local_path)
    if not success_news:
        news_local_path = None

    local_paths = {
        "background": bg_local_path,
        "logo": logo_local_path,
        "gradient": gradient_local_path,
        "news": news_local_path
    }

    config = VideoConfig()
    final_clip = create_final_clip(post_data, local_paths, config)

    logger.info("[lambda_handler] Rendering the final video to %s", complete_local)
    final_clip.write_videofile(
        complete_local,
        fps=24,
        codec="libx264",
        audio=False
    )

    logger.info("[lambda_handler] Uploading rendered video to S3: %s", complete_key)
    s3.upload_file(
        complete_local,
        bucket_name,
        complete_key,
        ExtraArgs={
            "ContentType": "video/mp4",
            "ContentDisposition": 'attachment; filename="complete_post.mp4"',
        },
    )

    logger.info("[lambda_handler] Lambda processing completed successfully.")
    return {
        "status": "rendered",
        "video_key": complete_key
    }
