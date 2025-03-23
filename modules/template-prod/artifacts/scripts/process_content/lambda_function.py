"""
This module provides a handler function that processes incoming event data
and updates or returns the contained post object.
"""

import os
import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

IMAGE_MAGICK_EXE = os.environ.get("IMAGE_MAGICK_EXE", "/bin/magick")


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Process the incoming event containing post data.

    This function checks for the "post" data within the event. If it's not
    found, it attempts to retrieve it from "processedContent.post". If post
    data is still not found, an error is returned. Otherwise, the post is
    processed by assigning empty values to 'title', 'description', and
    'image_path', and returns the processed post wrapped in a dictionary
    with a "status" key.

    Args:
        event (dict): Event data that should contain the "post" or
            "processedContent.post" keys.
        context (object): Lambda context object (unused in this function).

    Returns:
        dict: A dictionary containing:
            - "status" (str): "processed" if post data was found,
              otherwise "error".
            - "post" (dict): The processed post data if successful.
            - "error" (str): An error message if the post data is missing.
    """
    post = event.get("post") or event.get("processedContent", {}).get("post")

    if not post or not isinstance(post, dict):
        error_msg = "No valid 'post' data found in event."
        logger.error(error_msg)
        return {"status": "error", "error": error_msg}

    post["title"] = ""
    post["description"] = ""
    post["image_path"] = ""

    logger.info("Post successfully processed.")
    return {"status": "processed", "post": post}
