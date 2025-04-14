import os
import feedparser
import hashlib
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DEFAULT_FEED_URL = "https://feeds.feedburner.com/ign/news"

def fetch_latest_news_post(feed_url: str = DEFAULT_FEED_URL) -> Optional[Dict[str, str]]:
    """
    Fetch the most recent post from the given RSS feed URL.
    The IGN Feedburner feed does not include typical tags or categories
    that might have been present in other RSS feeds.

    :param feed_url: The RSS feed URL.
    :return: A dict with 'title', 'link', 'description' if found, else None.
    """
    logger.debug(f"Parsing feed from: {feed_url}")
    feed = feedparser.parse(feed_url)
    logger.debug("Full feed data: %s", feed)
    
    if feed.bozo:
        logger.error("Failed to parse RSS feed: %s", feed.bozo_exception)
        return {"status": "error", "message": "Failed to parse RSS feed."}
    
    if not feed.entries:
        logger.info("Feed parsed, but no entries found.")
        return None

    try:
        first = feed.entries[0]
        
        post = {
            "title": first.get("title"),
            "link": first.get("link"),
            "description": first.get("description")
        }
        return post

    except Exception as error:
        logger.exception("Error processing feed entries: %s", error)
        return None


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler function that retrieves a post and returns it,
    assigning a generated post ID if one is not supplied.

    Args:
        event (Dict[str, Any]): A dictionary containing the input data (e.g., "post_id").
        context (Any): The Lambda context object (not used here).

    Returns:
        Dict[str, Any]: A dictionary containing:
            - "status": A status message indicating whether a post was found.
            - "post_id": The provided or generated post ID.
            - "post": The post data, if found. The dictionary within "post" 
              contains "title", "link", and "description".
    """
    feed_url = os.getenv("IGN_FEED_URL", DEFAULT_FEED_URL)

    post = fetch_latest_news_post(feed_url=feed_url)
    if post is not None and not post.get("status") == "error":
        link = post["link"] or ""
        stable_post_id = hashlib.md5(link.encode("utf-8")).hexdigest()
        logger.info(f"Found post; stable_post_id={stable_post_id}")

        return {
            "status": "post_found",
            "post_id": stable_post_id,
            "post": post
        }

    if post and post.get("status") == "error":
        return {
            "status": "error",
            "message": post.get("message", "Failed to parse RSS feed.")
        }

    logger.info("No post found")
    return {
        "status": "no_post"
    }
