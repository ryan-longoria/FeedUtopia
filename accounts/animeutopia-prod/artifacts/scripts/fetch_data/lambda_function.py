from __future__ import annotations

import hashlib
import logging
import os
import re
from typing import Any, Dict, Optional
import html
import binascii
import textwrap

import cloudscraper
import feedparser

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DEFAULT_FEED_URL = "https://www.animenewsnetwork.com/newsroom/rss.xml"
ALLOWED_CATEGORIES = {"anime", "people", "just for fun", "live-action"}

_scraper = cloudscraper.create_scraper(
    browser={
        "custom": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36 FeedFetcher-Lambda"
        )
    }
)

_ILLEGAL_XML_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]")
_AMP_RE = re.compile(r"&(?!(?:amp|lt|gt|apos|quot|#\d+|#x[\da-fA-F]+);)")
_TAG_BACKSLASH_RE = re.compile(r"<\s*\\\s*")
_BAD_TAG_RE = re.compile(r"</?(?:div|span|img|script|iframe)[^>]*>", re.I)
_ALLOWED_TAGS = r"(?:a|p|br|img)"
_ESCAPE_LEFT_ANGLE_RE = re.compile(r"<(?!(/?\s*" + _ALLOWED_TAGS + r")\b)", re.I)
_DECL_RE = re.compile(r"<![^>]*>", re.I)

def _log_bad_xml(chunk: str, exc: Exception) -> None:
    """
    Write information about the ExpatError to CloudWatch:
    * line/column
    * 32-byte hex dump around the offending byte
    """
    logger.error("Expat error: %s", exc)

    m = re.search(r":(\d+):(\d+)", str(exc))
    if not m:
        logger.error("Could not extract position from error string.")
        return

    line, col = map(int, m.groups())
    abs_pos = sum(len(l) + 1 for l in chunk.splitlines(True)[: line - 1]) + col - 1
    start, end = max(abs_pos - 16, 0), min(abs_pos + 16, len(chunk))
    snippet = chunk[start:end].encode("utf-8", "replace")

    logger.error(
        "Hex dump around error (offset %d):\n%s",
        abs_pos,
        textwrap.indent(binascii.hexlify(snippet).decode(), "  "),
    )


def _clean_xml(text: str) -> str:
    """Make ANN’s feed XML-safe for Expat."""
    text = _ILLEGAL_XML_RE.sub("", text)
    text = _DECL_RE.sub("", text)
    text = _AMP_RE.sub("&amp;", text)
    text = _TAG_BACKSLASH_RE.sub("<", text)
    text = _BAD_TAG_RE.sub("", text)
    text = _ESCAPE_LEFT_ANGLE_RE.sub("&lt;", text)
    return text


def _download_and_parse(url: str) -> tuple[feedparser.FeedParserDict, str]:
    """Download, scrub, and parse the feed, logging bad XML if found."""
    resp = _scraper.get(url, timeout=10)
    resp.raise_for_status()
    cleaned = _clean_xml(resp.text)

    feed = feedparser.parse(cleaned)
    return feed, cleaned


def fetch_latest_news_post(feed_url: str = DEFAULT_FEED_URL) -> Optional[Dict[str, str]]:
    """
    Return the first feed entry whose <category> matches ALLOWED_CATEGORIES.

    Args:
        feed_url: RSS feed URL to query.

    Returns:
        Dict with 'title', 'link', 'description' or None if nothing matches.
    """
    try:
        feed, raw_xml = _download_and_parse(feed_url)
    except Exception as exc:
        logger.error("Could not download RSS feed: %s", exc)
        return None

    if feed.bozo and not feed.entries:
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


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Step-Functions task handler.

    Returns:
        {
            "status": "post_found" | "no_post",
            "post_id": <md5(link)> ,    # only when post_found
            "post":    {...}            # only when post_found
        }
    """
    feed_url = os.getenv("ANIME_FEED_URL", DEFAULT_FEED_URL)

    post = fetch_latest_news_post(feed_url)
    if post:
        link = post["link"] or ""
        stable_post_id = hashlib.md5(link.encode("utf-8")).hexdigest()
        logger.info("Found post; stable_post_id=%s", stable_post_id)

        return {"status": "post_found", "post_id": stable_post_id, "post": post}

    logger.info("No post found")
    return {"status": "no_post"}