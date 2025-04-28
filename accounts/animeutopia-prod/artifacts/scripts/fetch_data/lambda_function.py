from __future__ import annotations

import hashlib
import logging
import os
import re
from typing import Any, Dict, Optional

import feedparser
import requests

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DEFAULT_FEED_URL = "https://www.animenewsnetwork.com/newsroom/rss.xml"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; FeedFetcher-Lambda/1.0; +https://us-east-2.console.aws.amazon.com)"
    ),
    "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
}

ALLOWED_CATEGORIES = {"anime", "people", "just for fun", "live-action"}

_ILLEGAL_XML_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")

def _clean_xml(text: str) -> str:
    """Strip characters that are not allowed in XML 1.0."""
    return _ILLEGAL_XML_RE.sub("", text)


def _download_and_parse(url: str) -> feedparser.FeedParserDict:
    """
    Download `url`, scrub illegal bytes, and parse with feedparser.

    Raises:
        requests.HTTPError: If the GET fails (4xx/5xx).
    """
    resp = requests.get(url, headers=HEADERS, timeout=10)
    resp.raise_for_status()
    cleaned = _clean_xml(resp.text)
    return feedparser.parse(cleaned)


def fetch_latest_news_post(
    feed_url: str = DEFAULT_FEED_URL,
) -> Optional[Dict[str, str]]:
    """
    Return the first feed entry whose <category> matches ALLOWED_CATEGORIES.

    Args:
        feed_url: RSS feed URL to query.

    Returns:
        A dict with 'title', 'link', 'description' keys, or ``None`` if no
        matching post exists (or the feed is empty/unreadable).
    """
    try:
        feed = _download_and_parse(feed_url)
    except requests.RequestException as exc:
        logger.error("Could not download RSS feed: %s", exc)
        return None

    if feed.bozo and not feed.entries:
        logger.error("Unreadable RSS feed after scrubbing: %s", feed.bozo_exception)
        return None

    for entry in feed.entries:
        for tag in entry.get("tags", []):
            term = tag.get("term", "").strip().lower()
            if term in ALLOWED_CATEGORIES:
                return {
                    "title": entry.get("title", ""),
                    "link": entry.get("link", ""),
                    "description": entry.get("description", ""),
                }

    logger.info("No matching posts found in RSS feed.")
    return None


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Step-Functions task handler.

    Returns:
        {
            "status": "post_found" | "no_post",
            "post_id":  <md5 of link> (only when post_found),
            "post":     {...}        (only when post_found)
        }
    """
    feed_url = os.getenv("ANIME_FEED_URL", DEFAULT_FEED_URL)

    post = fetch_latest_news_post(feed_url)
    if post:
        link = post["link"] or ""
        stable_post_id = hashlib.md5(link.encode("utf-8")).hexdigest()
        logger.info("Found post; stable_post_id=%s", stable_post_id)

        return {
            "status": "post_found",
            "post_id": stable_post_id,
            "post": post,
        }

    logger.info("No post found")
    return {"status": "no_post"}