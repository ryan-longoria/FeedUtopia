import uuid
import logging
from typing import Dict, Any, Optional

import feedparser

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

def fetch_post() -> Optional[Dict[str, str]]:
    """
    Fetch the most recent News post from the WrestlingInc feed.

    Returns:
        A dictionary containing keys "title", "link", and "description" if found,
        otherwise None.
    """
    feed_url = "https://www.wrestlinginc.com/category/wwe-news/feed/"
    feed = feedparser.parse(feed_url)

    if feed.bozo:
        logger.error("Failed to parse RSS feed: %s", feed.bozo_exception)
        return None

    for entry in feed.entries:
        categories = [tag.term.lower() for tag in entry.get("tags", []) if tag.term]
        if "news" in categories:
            return {
                "title": entry.get("title"),
                "link": entry.get("link"),
                "description": entry.get("description", "")
            }

    return None


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler function that retrieves a post (from WrestlingInc RSS) and returns it,
    assigning a generated post ID if one is not supplied.
    """
    post_id = event.get("post_id", str(uuid.uuid4()))
    post = fetch_post()

    if post:
        logger.info("Found 'News' post, assigning post_id = %s", post_id)
        return {
            "status": "post_found",
            "post_id": post_id,
            "post": post
        }

    logger.info("No post found or feed parse error")
    return {
        "status": "no_post"
    }
