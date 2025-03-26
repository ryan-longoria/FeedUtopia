import os
import hashlib
import logging
from typing import Any, Dict, Optional, List

import feedparser

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

DEFAULT_FEED_URL = "https://www.wrestlinginc.com/category/wwe-news/feed/"


def fetch_latest_news_post(feed_url: str = DEFAULT_FEED_URL) -> Optional[Dict[str, str]]:
    """
    Fetch the most recent 'News' post from the given RSS feed URL.

    :param feed_url: The RSS feed URL.
    :return: A dict with 'title', 'link', 'description' if found, else None.
    """
    logger.debug(f"Parsing feed from: {feed_url}")
    feed = feedparser.parse(feed_url)

    if feed.bozo:
        logger.error("Failed to parse RSS feed: %s", feed.bozo_exception)
        return None

    if not feed.entries:
        logger.info("Feed parsed, but no entries found.")
        return None

    for entry in feed.entries:
        tags = entry.get("tags", [])
        categories = [tag.term.lower() for tag in tags if tag.term]
        if "news" in categories:
            logger.debug("Found a 'News' entry.")
            return {
                "title": entry.get("title", ""),
                "link": entry.get("link", ""),
                "description": entry.get("description", ""),
            }
    return None


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler function that retrieves a post and returns it,
    assigning a generated post ID if one is not supplied.

    This function is intended to be used in a state machine step before
    the one that sends a notification to Microsoft Teams. The output
    conforms to the structure that the next step expects.

    Args:
        event (Dict[str, Any]): A dictionary containing the input data
            (e.g., "post_id").
        context (Any): The Lambda context object (not used here).

    Returns:
        Dict[str, Any]: A dictionary containing:
            - "status": A status message indicating whether a post was found.
            - "post_id": The provided or generated post ID.
            - "post": The post data, if found. The dictionary within "post" 
              contains "title", "link", and "description".
    """
    feed_url = os.getenv("WRESTLING_FEED_URL", DEFAULT_FEED_URL)

    post = fetch_latest_news_post(feed_url=feed_url)
    if post is not None:
        link = post.get("link", "")
        stable_post_id = hashlib.md5(link.encode("utf-8")).hexdigest()
        logger.info(f"Found 'News' post; stable_post_id={stable_post_id}")

        return {
            "status": "post_found",
            "post_id": stable_post_id,
            "post": post,
        }

    logger.info("No post found or feed parse error.")
    return {"status": "no_post"}
