from __future__ import annotations

import hashlib
import logging
import os
import re
from typing import Any, Dict, List, Optional

import bs4
import cloudscraper

__all__ = ["lambda_handler"]

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

NEWS_USER = os.environ["ANN_NEWS_USER"]
NEWS_PASS = os.environ["ANN_NEWS_PASS"]
REFERER   = os.environ.get("TEAMS_WEBHOOK_URL")

DEFAULT_FEED_URL = (
    "https://www.animenewsnetwork.com/newsfeed/getnews.php"
    f"?u={NEWS_USER}&p={NEWS_PASS}"
    "&filter=anime,people,just%20for%20fun,live-action"
)

ALLOWED_CATEGORIES = {"anime", "people", "just for fun", "live-action"}

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_ILLEGAL_XML = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]")
_AMP = re.compile(r"&(?!(?:amp|lt|gt|apos|quot|#\d+|#x[\da-fA-F]+);)")

_SCRAPER = cloudscraper.create_scraper(
    delay=10,
    browser={
        "custom": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36 FeedFetcher-Lambda"
        )
    },
)


def _clean(text: str) -> str:
    """Strip control bytes and escape stray ampersands."""
    return _AMP.sub("&amp;", _ILLEGAL_XML.sub("", text))


def _fetch_feed(url: str = DEFAULT_FEED_URL) -> str:
    """
    Download ANN’s Newsfeed, letting cloudscraper handle Cloudflare’s
    JavaScript challenge automatically.
    """
    if not _SCRAPER.cookies.get("cf_clearance"):
        _SCRAPER.get(
            "https://www.animenewsnetwork.com/",
            timeout=10,
            headers={"User-Agent": _SCRAPER.headers["User-Agent"]},
        )

    resp = _SCRAPER.get(
        url,
        timeout=10,
        headers={
            "Referer": REFERER,
            "Accept": "text/html",
        },
    )
    resp.raise_for_status()
    return _clean(resp.text)


def _parse_items(html_text: str) -> List[Dict[str, str]]:
    """Convert ANN’s HTML fragment into structured dicts."""
    soup = bs4.BeautifulSoup(html_text, "html.parser")
    items: List[Dict[str, str]] = []

    for p in soup.find_all("p"):
        bold = p.find("b")
        link = bold.find("a") if bold else None
        if not link or not link.text:
            continue

        _, _, category_part = bold.get_text(" ", strip=True).rpartition(" - ")
        description = _HTML_TAG_RE.sub("", p.get_text(" ", strip=True)).split("]")[0]

        items.append(
            {
                "title": link.text.strip(),
                "link": link["href"],
                "description": description.strip(),
                "category": category_part.lower(),
            }
        )
    return items


def fetch_latest_news_post(url: str = DEFAULT_FEED_URL) -> Optional[Dict[str, str]]:
    """Return the newest Newsfeed item whose category is allowed."""
    try:
        raw_html = _fetch_feed(url)
    except Exception as exc:
        logger.error("Could not download Newsfeed: %s", exc)
        return None

    for item in _parse_items(raw_html):
        if item["category"] in ALLOWED_CATEGORIES:
            return {k: item[k] for k in ("title", "link", "description")}

    logger.info("No matching posts found in Newsfeed.")
    return None


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS-Lambda entry-point expected by the Step Functions state machine.
    """
    post = fetch_latest_news_post()
    if post:
        post_id = hashlib.md5(post["link"].encode()).hexdigest()
        logger.info("Found post; id=%s", post_id)
        return {"status": "post_found", "post_id": post_id, "post": post}

    logger.info("No post found")
    return {"status": "no_post"}