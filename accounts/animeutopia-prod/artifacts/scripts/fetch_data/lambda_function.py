import os
import feedparser
import hashlib
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DEFAULT_FEED_URL = "https://www.animenewsnetwork.com/newsroom/rss.xml"

ALLOWED_CATEGORIES = {"anime", "people", "just for fun", "live-action"}


def fetch_latest_news_post(feed_url: str = DEFAULT_FEED_URL) -> Optional[Dict[str, str]]:
    """
    Fetch the most recent news post matching allowed categories from the given RSS feed URL.

    This function parses the RSS feed and iterates through the available entries,
    returning the first entry that matches a category listed in ALLOWED_CATEGORIES.
    Minor feed parsing errors are ignored if entries are still available.

    Args:
        feed_url (str): The RSS feed URL to parse.

    Returns:
        Optional[Dict[str, str]]: A dictionary containing 'title', 'link', and 'description'
        if a matching post is found. Returns None if no matching post exists or the feed is empty.
    """
    feed = feedparser.parse(feed_url)

    if feed.bozo and not feed.entries:
        logger.error("Unreadable RSS feed: %s", feed.bozo_exception)
        return None

    for entry in feed.entries:
        for tag in entry.get("tags", []):
            term = tag.get("term", "").strip().lower()
            if term in ALLOWED_CATEGORIES:
                return {
                    "title": entry.get("title", ""),
                    "link": entry.get("link", ""),
                    "description": entry.get("description", "")
                }

    logger.info("No matching posts found in RSS feed.")
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
