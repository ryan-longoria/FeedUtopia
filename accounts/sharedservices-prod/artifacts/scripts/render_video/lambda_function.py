import datetime
import json
import os
import logging
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
    """
    Use Pillow to measure the pixel width of a single word.
    """
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
    """
    Splits 'full_text' into as many lines as needed to respect 'max_width'.
    Each word is a separate TextClip for partial highlighting.

    1) Splits full_text on whitespace into words.
    2) Measures each word with Pillow so we know if it fits in the current line.
    3) If adding the next word would exceed max_width, we start a new line.
    4) Each line is rendered as a horizontal CompositeVideoClip of word clips.
    5) We then stack those line clips vertically.
    6) Returns a single CompositeVideoClip with all lines and partial coloring.
    """

    words = full_text.split()
    lines = []
    current_line = []
    current_line_width = 0

    # Build a list-of-lists: multiple lines, each containing words
    for word in words:
        clean_word = word.strip(",.!?;:").upper()
        w_px = measure_text_width_pillow(word, font_path, font_size)
        # If there's something already on the line, we need 'space' before adding the new word
        extra_needed = w_px + (space if current_line else 0)

        if current_line_width + extra_needed <= max_width:
            # Fits on the current line
            current_line.append(word)
            current_line_width += extra_needed
        else:
            # Start a new line
            lines.append(current_line)
            current_line = [word]
            current_line_width = w_px

    # Add last line if there's any leftover
    if current_line:
        lines.append(current_line)

    # Now create one CompositeVideoClip per line
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
                    # We do NOT pass size=... or method="caption" for a single word
                )
                .with_duration(duration)
            )

            # Place this word horizontally after the previous one
            txt_clip = txt_clip.with_position((x_offset, 0))
            x_offset += txt_clip.w + space
            word_clips.append(txt_clip)

        if word_clips:
            line_height = word_clips[0].h
            # The width of this line = x_offset - space (the last x_offset includes trailing space)
            line_width = max(x_offset - space, 1)
            line_composite = CompositeVideoClip(word_clips, size=(line_width, line_height))
            line_composite = line_composite.with_duration(duration)
            line_clips.append(line_composite)
        else:
            # If we ended up with an empty line
            blank = ColorClip((1,1), color=(0,0,0)).with_duration(duration)
            line_clips.append(blank)

    # Now stack all line_clips vertically
    stacked_clips = []
    current_y = 0
    for lc in line_clips:
        lw, lh = lc.size
        # Place this line at y=current_y
        line_pos = lc.with_position((0, current_y))
        stacked_clips.append(line_pos)
        current_y += lh + line_spacing

    # Remove the last line_spacing if we want no trailing space
    if stacked_clips:
        current_y -= line_spacing

    total_height = max(current_y, 1)  # Ensure at least 1 pixel high

    # The total width is whichever line was widest
    max_line_width = 1
    for lc in line_clips:
        w, h = lc.size
        if w > max_line_width:
            max_line_width = w

    final_clip = CompositeVideoClip(
        stacked_clips,
        size=(max_line_width, total_height)
    ).with_duration(duration)

    return final_clip

def lambda_handler(event, context):
    logger.info("Render video lambda started")

    # Get highlight fields
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

    # For demonstration, let's set different bounding widths for title vs. subtitle
    title_max_width = 800
    subtitle_max_width = 900

    # Dynamic font sizing (optional)
    top_font_size = dynamic_font_size(title_text, max_size=100, min_size=40, ideal_length=20)
    subtitle_font_size = dynamic_font_size(description_text, max_size=50, min_size=25, ideal_length=30)

    # Create the multiline text clips
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
        duration=10
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
        duration=10
    )

    width, height = 1080, 1080
    duration_sec = 10

    # Example background
    bg_clip = ColorClip((width, height), color=(0, 0, 0)).with_duration(duration_sec)

    # Place the multiline clips at some positions (example)
    multiline_title_clip = multiline_title_clip.with_position((100, 100))
    multiline_subtitle_clip = multiline_subtitle_clip.with_position((100, 500))

    # Combine everything
    final_clips = [bg_clip, multiline_title_clip, multiline_subtitle_clip]
    final_comp = CompositeVideoClip(final_clips, size=(width, height)).with_duration(duration_sec)

    # For example, let's suppose we have an S3 bucket and key set up as environment variables
    bucket_name = os.environ.get("TARGET_BUCKET", "my-bucket")
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    folder = f"posts/post_{timestamp_str}"
    complete_key = f"{folder}/complete_post.mp4"
    complete_local = "/tmp/complete_post.mp4"

    final_comp.write_videofile(complete_local, fps=24, codec="libx264", audio=False)

    s3 = boto3.client("s3")
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
