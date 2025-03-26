import datetime
import os
import logging
import numpy as np
import boto3
from moviepy.video.VideoClip import ColorClip, ImageClip, TextClip
from moviepy.video.compositing.CompositeVideoClip import CompositeVideoClip, clips_array
from moviepy.video.io.VideoFileClip import VideoFileClip
import moviepy.video.fx as vfx
from PIL import ImageFont, ImageDraw, Image

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")
font_path = "/usr/share/fonts/truetype/msttcorefonts/ariblk.ttf"

def measure_text_width_pillow(word, font_path, font_size):
    """
    Use Pillow to measure the pixel width of a single 'word'.
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

    1) We measure each word with Pillow (so we don't rely on MoviePy's size= param).
    2) We keep adding words to the current line until adding another word would exceed max_width.
    3) We finalize that line and move on to the next line, etc.
    4) For each line, we create a CompositeVideoClip horizontally placing the word clips.
    5) We stack all line clips vertically, with 'line_spacing' between them.

    :param full_text: The raw text to display (already upper() if desired).
    :param highlight_words: A set of words (uppercase) to color in highlight color.
    :param font_path: Path to your TTF font.
    :param font_size: The integer font size for every word.
    :param max_width: The maximum pixel width for each line (beyond that, wrap).
    :param color_default: The default text color.
    :param color_highlight: The color for highlighted words.
    :param space: Horizontal spacing (pixels) between words on the same line.
    :param line_spacing: Vertical spacing (pixels) between one line and the next.
    :param duration: The duration of the returned clip.

    :return: A CompositeVideoClip of all lines stacked vertically.
    """

    # Split text into separate words.
    words = full_text.split()
    lines = []
    current_line = []
    current_line_width = 0

    # We'll measure each word with Pillow to see if it fits in current_line
    for word in words:
        # Clean punctuation if you want better matching
        clean_word = word.strip(",.!?;:").upper()

        w_px = measure_text_width_pillow(word, font_path, font_size)
        # If current line is not empty, we also need 'space' before adding a new word
        extra_needed = w_px + (space if current_line else 0)

        if current_line_width + extra_needed <= max_width:
            # Add this word to current line
            current_line.append(word)
            current_line_width += extra_needed
        else:
            # Finalize the current line, and start a new line
            lines.append(current_line)
            current_line = [word]
            current_line_width = w_px

    # Don't forget the last line
    if current_line:
        lines.append(current_line)

    # Now build a CompositeVideoClip for each line
    line_clips = []
    y_offset = 0
    for line_words in lines:
        # We'll create word clips horizontally.
        x_offset = 0
        word_clips = []
        for w in line_words:
            clean_w = w.strip(",.!?;:").upper()
            color = color_highlight if clean_w in highlight_words else color_default

            # We'll just use a "classic" approach:
            #   TextClip(text=..., font_size=..., color=...)
            # In new moviepy versions, param is font_size=, not fontsize=.
            # We do NOT set size= or method="caption" for single-word clips.
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

        # line width = x_offset - space (the last offset includes extra space)
        # line height = word_clips[0].h (assuming all the same font_size)
        if not word_clips:
            # If line is empty for some reason, create a 1x1
            line_clips.append(ColorClip((1, 1), color=(0, 0, 0), duration=duration))
        else:
            line_height = word_clips[0].h
            line_composite = CompositeVideoClip(
                word_clips, size=(x_offset - space, line_height)
            ).with_duration(duration)
            line_clips.append(line_composite)

    # Now we have multiple line_composites. We stack them vertically.
    # We'll place them one after another with line_spacing in between.
    stacked_clips = []
    current_y = 0
    for lc in line_clips:
        # Place each line at y=current_y
        line_pos = lc.with_position((0, current_y))
        stacked_clips.append(line_pos)
        current_y += lc.h + line_spacing

    # Finally, combine all line clips into a single vertical composite
    # The total height = sum of line heights + spacing
    total_height = 0
    if stacked_clips:
        last_line = stacked_clips[-1]
        total_height = last_line.pos[1] + last_line.h  # Y + height
    else:
        total_height = 1  # just in case there's no text

    max_line_width = 0
    for lc in line_clips:
        # each line is CompositeVideoClip(...) with size=(line_width, line_height)
        w, _ = lc.size
        if w > max_line_width:
            max_line_width = w

    final_clip = CompositeVideoClip(
        stacked_clips,
        size=(max_line_width, total_height)
    ).with_duration(duration)

    return final_clip


def lambda_handler(event, context):
    logger.info("Render video lambda started")
    bucket_name = os.environ.get("TARGET_BUCKET", "some-default-bucket")
    timestamp_str = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    folder = f"posts/post_{timestamp_str}"
    complete_key = f"{folder}/complete_post.mp4"
    complete_local = "/mnt/efs/complete_post.mp4"

    # Get highlight fields
    highlight_words_title_raw = event.get("highlightWordsTitle", "") or ""
    highlight_words_description_raw = event.get("highlightWordsDescription", "") or ""

    highlight_words_title = {
        w.strip().upper() for w in highlight_words_title_raw.split(",") if w.strip()
    }
    highlight_words_description = {
        w.strip().upper() for w in highlight_words_description_raw.split(",") if w.strip()
    }

    # Title / description
    title_text = (event.get("title") or "").upper()
    description_text = (event.get("description") or "").upper()

    # For example, different bounding widths (margins) for title vs. subtitle
    # Suppose the title can be up to 800px wide, but the subtitle can be up to 900px.
    # Adjust as you see fit.
    title_max_width = 800
    subtitle_max_width = 900

    # Font sizing
    top_font_size = dynamic_font_size(title_text, max_size=100, min_size=40, ideal_length=20)
    subtitle_font_size = dynamic_font_size(description_text, max_size=50, min_size=25, ideal_length=30)

    # If you'd like to keep them separate, we can build two multiline clips:
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

    # Now place them at different positions on a 1080x1080 background
    width, height = 1080, 1080
    duration_sec = 10

    # e.g. black background
    bg_clip = ColorClip((width, height), color=(0, 0, 0)).with_duration(duration_sec)

    # Suppose we want the title near the top, and the subtitle near the bottom
    # We'll place them manually. Or you can do any dynamic logic you want.
    # We'll place the multiline title at x=100, y=100
    # We'll place the multiline subtitle at x=90, y=600

    multiline_title_clip = multiline_title_clip.with_position((100, 100))
    multiline_subtitle_clip = multiline_subtitle_clip.with_position((90, 600))

    final_clips = [bg_clip, multiline_title_clip, multiline_subtitle_clip]
    final_comp = CompositeVideoClip(final_clips, size=(width, height)).with_duration(duration_sec)

    # Save
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

    return {
        "status": "rendered",
        "video_key": complete_key
    }
