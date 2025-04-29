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


def _matches_allowed(entry: Dict[str, Any]) -> bool:
    for tag in entry.get("tags", []):
        if tag.get("term", "").strip().lower() in ALLOWED_CATEGORIES:
            return True
    if "category" in entry:
        if entry["category"].strip().lower() in ALLOWED_CATEGORIES:
            return True
    return False


def _to_post(entry: Dict[str, Any]) -> Optional[Dict[str, str]]:
    post = {
        "title": entry.get("title", "").strip(),
        "link": entry.get("link", "").strip(),
        "description": entry.get("description", "").strip(),
    }
    return post if all(post.values()) else None


def fetch_latest_news_post(
    feed_url: str = DEFAULT_FEED_URL,
) -> Optional[Dict[str, str]]:
    """
    Return the newest item in *feed_url* whose category is allowed.
    If categories are missing, return the first item.
    """
    feed = feedparser.parse(feed_url)

    if getattr(feed, "status", 200) >= 400:
        logger.error("RSS returned HTTP %s", getattr(feed, "status", "???"))
        return None

    if feed.bozo:
        logger.warning("Feed malformed: %s", feed.bozo_exception)

    if not feed.entries:
        return None

    for entry in feed.entries:
        if _matches_allowed(entry):
            return _to_post(entry)

    return _to_post(feed.entries[0])


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda entry point for the Step Functions state machine.
    """
    feed_url = os.getenv("ANIME_FEED_URL", DEFAULT_FEED_URL)
    post = fetch_latest_news_post(feed_url)

    if post:
        post_id = hashlib.md5(post["link"].encode("utf-8")).hexdigest()
        logger.info("Found post; id=%s", post_id)
        return {"status": "post_found", "post_id": post_id, "post": post}

    logger.info("No post found.")
    return {"status": "no_post"}
