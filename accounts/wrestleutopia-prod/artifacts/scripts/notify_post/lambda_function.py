import os
import json
import logging
import requests
from typing import Any, Dict

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler function that posts text content about the newly found post
    directly to Microsoft Teams. It expects to receive an event containing:
      {
        "status": "post_found",
        "post_id": "...",
        "post": {
           "title": "...",
           "link": "...",
           "description": "..."
        }
      }
    """
    TEAMS_WEBHOOK_URL = os.environ.get("TEAMS_WEBHOOK_URL")
    if not TEAMS_WEBHOOK_URL:
        error_msg = "TEAMS_WEBHOOK_URL environment variable not set."
        logger.error(error_msg)
        return {"error": error_msg}

    post_id = event.get("post_id", "No ID")
    post = event.get("post", {})
    title = post.get("title", "No Title Found")
    link = post.get("link", "No Link Found")
    description = post.get("description", "No Description Found")

    message_text = (
        f"**A new post has been found!**\n\n"
        f"**Post ID**: {post_id}\n\n"
        f"**Title**: {title}\n\n"
        f"**Link**: {link}\n\n"
        f"**Description**: {description}\n"
    )

    logger.info("Sending the following message to Teams:\n%s", message_text)

    try:
        response = requests.post(
            TEAMS_WEBHOOK_URL,
            headers={"Content-Type": "application/json"},
            data=json.dumps({"text": message_text}),
            timeout=10,
        )
        response.raise_for_status()
        logger.info("Message posted to Microsoft Teams successfully.")
        return {"status": "message_posted", "post_id": post_id}
    except Exception as ex:
        logger.error("Error posting to Teams: %s", ex, exc_info=True)
        return {"error": str(ex)}
