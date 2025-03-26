import hashlib
import logging
from typing import Dict, Any, Optional

import feedparser

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

def fetch_post() -> Optional[Dict[str, str]]:
    """
    Fetch the most recent 'News' post from the WrestlingInc RSS feed.
    Return a dict with 'title', 'link', 'description' if found, else None.
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
    AWS Lambda handler function that retrieves a post from the feed and returns it.
    Instead of generating a random post_id, we create a stable ID from the link,
    so duplicates can be detected reliably by 'check_duplicate'.
    """
    post = fetch_post()

    if post:
        link = post["link"] or ""
        stable_post_id = hashlib.md5(link.encode("utf-8")).hexdigest()

        logger.info("Found 'News' post; using stable_post_id=%s", stable_post_id)

        return {
            "status": "post_found",
            "post_id": stable_post_id,
            "post": post
        }

    logger.info("No post found or feed parse error")
    return {
        "status": "no_post"
    }
