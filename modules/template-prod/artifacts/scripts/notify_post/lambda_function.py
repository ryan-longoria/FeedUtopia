import json
import logging
import os
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def build_message_text(post_id: str, title: str, link: str, description: str) -> str:
    """
    Build the message text that will be sent to Microsoft Teams.

    Args:
        post_id (str): Unique identifier for the post.
        title (str): Title of the post.
        link (str): Link to the post.
        description (str): Description or summary of the post.

    Returns:
        str: A formatted Markdown text message suitable for Teams.
    """
    message = (
        f"**A new post has been found!**\n\n"
        f"**Post ID**: {post_id}\n\n"
        f"**Title**: {title}\n\n"
        f"**Link**: {link}\n\n"
        f"**Description**: {description}\n"
    )
    return message


def post_to_teams(message_text: str) -> None:
    """
    Post a given message text to a Microsoft Teams webhook defined by the
    'TEAMS_WEBHOOK_URL' environment variable.

    Args:
        message_text (str): The message content to be posted.

    Raises:
        ValueError: If the Teams webhook URL is not set in the environment.
        requests.RequestException: If the POST request fails for any reason.
    """
    teams_webhook_url = os.environ.get("TEAMS_WEBHOOK_URL")
    if not teams_webhook_url:
        logger.error("TEAMS_WEBHOOK_URL environment variable not set.")
        raise ValueError("TEAMS_WEBHOOK_URL environment variable not set.")

    logger.info("Sending the following message to Teams:\n%s", message_text)

    response = requests.post(
        url=teams_webhook_url,
        headers={"Content-Type": "application/json"},
        data=json.dumps({"text": message_text}),
        timeout=10
    )
    response.raise_for_status()
    logger.info("Message posted to Microsoft Teams successfully.")


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler function that posts text content about a newly found post
    to Microsoft Teams. It expects to receive an event in the following format:
    
    Example:
        {
            "status": "post_found",
            "post_id": "...",
            "post": {
                "title": "...",
                "link": "...",
                "description": "..."
            }
        }

    Args:
        event (Dict[str, Any]): Event data passed to the Lambda function.
            Must contain 'post_id' and 'post' keys to successfully post.
        context (Any): Runtime information provided by AWS Lambda (unused here).

    Returns:
        Dict[str, Any]: The result of the operation. If the message is posted
        successfully, returns:
            {
                "status": "message_posted",
                "post_id": <str>
            }
        Otherwise, returns:
            {
                "error": <str>
            }
    """
    post_id = event.get("post_id", "No ID")
    post_data: Dict[str, Optional[str]] = event.get("post", {})
    title = post_data.get("title", "No Title Found")
    link = post_data.get("link", "No Link Found")
    description = post_data.get("description", "No Description Found")

    try:
        message_text = build_message_text(post_id, title, link, description)
        post_to_teams(message_text)
        return {"status": "message_posted", "post_id": post_id}
    except (ValueError, requests.RequestException) as exc:
        logger.error("Error posting to Teams: %s", exc, exc_info=True)
        return {"error": str(exc)}
