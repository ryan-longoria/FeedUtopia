import os
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

IMAGE_MAGICK_EXE = os.environ.get("IMAGE_MAGICK_EXE", "/bin/magick")

def handler(event, context):
    post = event.get("post")
    if not post:
        post = event.get("processedContent", {}).get("post", {})

    if not post:
        error_msg = "No 'post' data found in event."
        logger.error(error_msg)
        return {"status": "error", "error": error_msg}

    post["title"] = ""
    post["description"] = ""
    post["image_path"] = ""

    return {"status": "processed", "post": post}
