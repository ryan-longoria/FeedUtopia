from __future__ import annotations

import binascii
import hashlib
import logging
import os
import re
import textwrap
from typing import Any, Dict, Optional

import feedparser
import requests

__all__ = ["lambda_handler"]

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

NEWS_USER = os.environ["ANN_NEWS_USER"]
NEWS_PASS = os.environ["ANN_NEWS_PASS"]

DEFAULT_FEED_URL = (
    "https://www.animenewsnetwork.com/newsfeed/getnews.php"
    f"?u={NEWS_USER}&p={NEWS_PASS}"
    "&filter=anime,people,just for fun,live-action"
)

ALLOWED_CATEGORIES = {"anime", "people", "just for fun", "live-action"}

_ILLEGAL_XML = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]")
_AMP = re.compile(r"&(?!(?:amp|lt|gt|apos|quot|#\d+|#x[\da-fA-F]+);)")


def _clean_xml(text: str) -> str:
    """Remove control bytes and escape stray ampersands."""
    text = _ILLEGAL_XML.sub("", text)
    return _AMP.sub("&amp;", text)


def _log_bad_xml(chunk: str, exc: Exception) -> None:
    """Emit a hex dump around the byte that made ``feedparser`` choke."""
    m = re.search(r":(\d+):(\d+)", str(exc))
    if not m:
        logger.error("Expat error: %s", exc)
        return
    line, col = map(int, m.groups())
    offset = sum(len(l) + 1 for l in chunk.splitlines(True)[: line - 1]) + col - 1
    snippet = chunk[max(offset - 16, 0) : offset + 16].encode("utf-8", "replace")
    logger.error(
        "Expat error at line %d col %d (offset %d)\n%s",
        line,
        col,
        offset,
        textwrap.indent(binascii.hexlify(snippet).decode(), "  "),
    )


def _download_and_parse(url: str) -> tuple[feedparser.FeedParserDict, str]:
    """Download *url*, sanitise its body and return the parsed feed."""
    resp = requests.get(url, timeout=10, headers={"Accept": "application/rss+xml"})
    resp.raise_for_status()
    cleaned = _clean_xml(resp.text)
    if "<rss" not in cleaned[:500].lower() and "<feed" not in cleaned[:500].lower():
        logger.error(
            "Downloaded content does not look like RSS. "
            "First 200 chars: %s",
            cleaned[:200].replace("\n", " "),
        )
        return feedparser.FeedParserDict(entries=[]), cleaned
    return feedparser.parse(cleaned), cleaned


def fetch_latest_news_post(
    feed_url: str = DEFAULT_FEED_URL,
) -> Optional[Dict[str, str]]:
    """Return the first feed entry whose category is in ``ALLOWED_CATEGORIES``."""
    try:
        feed, raw_xml = _download_and_parse(feed_url)
    except Exception as exc:  # noqa: BLE001
        logger.error("Could not download RSS feed: %s", exc)
        return None
    if getattr(feed, "bozo", False) and getattr(feed, "bozo_exception", None):
        _log_bad_xml(raw_xml, feed.bozo_exception)
    for entry in feed.entries:
        for tag in entry.get("tags", []):
            if tag.get("term", "").strip().lower() in ALLOWED_CATEGORIES:
                return {
                    "title": entry.get("title", ""),
                    "link": entry.get("link", ""),
                    "description": entry.get("description", ""),
                }
    logger.info("No matching posts found in RSS feed.")
    return None


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:  # noqa: D401
    """AWS Lambda entry-point."""
    post = fetch_latest_news_post()
    if post:
        pid = hashlib.md5(post["link"].encode()).hexdigest()
        logger.info("Found post; id=%s", pid)
        return {"status": "post_found", "post_id": pid, "post": post}
    logger.info("No post found")
    return {"status": "no_post"}
