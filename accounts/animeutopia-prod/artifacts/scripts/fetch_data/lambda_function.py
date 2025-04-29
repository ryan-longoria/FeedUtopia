from __future__ import annotations

import hashlib
import logging
import os
from typing import Any, Dict, Optional, Set

import feedparser

DEFAULT_FEED_URL = "https://www.animenewsnetwork.com/newsroom/rss.xml"

ALLOWED_CATEGORIES: Set[str] = {
    "anime",
    "people",
    "just for fun",
    "live-action",
}

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def fetch_latest_news_post(
    feed_url: str = DEFAULT_FEED_URL,
) -> Optional[Dict[str, str]]:
    """
    Return the first entry in *feed_url* whose category matches one of the
    allowed categories.

    The result always contains ``title``, ``link``, and ``description`` or
    is ``None`` when nothing qualifies.
    """
    feed = feedparser.parse(feed_url)

    status = getattr(feed, "status", 200)
    if status >= 400:
        logger.error("RSS returned HTTP %s", status)
        return None

    if feed.bozo:
        logger.warning("Feed malformed: %s", feed.bozo_exception)

    for entry in feed.entries:
        for tag in entry.get("tags", []):
            if tag.get("term", "").lower() in ALLOWED_CATEGORIES:
                post = {
                    "title": entry.get("title", "").strip(),
                    "link": entry.get("link", "").strip(),
                    "description": entry.get("description", "").strip(),
                }
                if all(post.values()):
                    return post
    return None


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda entry point for the Step Functions state machine.

    On success:
        {"status": "post_found", "post_id": <md5>, "post": {...}}
    Otherwise:
        {"status": "no_post"}
    """
    feed_url = os.getenv("ANIME_FEED_URL", DEFAULT_FEED_URL)
    post = fetch_latest_news_post(feed_url)

    if post:
        post_id = hashlib.md5(post["link"].encode("utf-8")).hexdigest()
        logger.info("Found post; id=%s", post_id)
        return {"status": "post_found", "post_id": post_id, "post": post}

    logger.info("No post found.")
    return {"status": "no_post"}
