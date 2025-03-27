import os
import feedparser
import hashlib
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger()
logger.setLevel(logging.DEBUG)

DEFAULT_FEED_URL = "https://www.animenewsnetwork.com/newsroom/rss.xml"

ALLOWED_CATEGORIES = {"anime", "people", "just for fun", "live-action"}


def fetch_latest_news_post(feed_url: str = DEFAULT_FEED_URL) -> Optional[Dict[str, str]]:
    """
    Fetch the most recent 'News' post from the given RSS feed URL.

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
        
        tags = first.get("tags", [])
        
        for tag_obj in tags:
            term = tag_obj.get("term", "").lower()
            if term in ALLOWED_CATEGORIES:
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
    feed_url = os.getenv("ANIME_FEED_URL", DEFAULT_FEED_URL)

    post = fetch_latest_news_post(feed_url=feed_url)
    if post is not None:
        link = post["link"] or ""
        stable_post_id = hashlib.md5(link.encode("utf-8")).hexdigest()
        logger.info(f"Found 'News' post; stable_post_id={stable_post_id}")

        return {
            "status": "post_found",
            "post_id": stable_post_id,
            "post": post
        }

    logger.info("No post found")
    return {
        "status": "no_post"
    }
