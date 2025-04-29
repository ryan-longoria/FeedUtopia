from __future__ import annotations

import hashlib
import logging
import os
import re
from typing import Any, Dict, List, Optional

import bs4
import requests

__all__ = ["lambda_handler"]

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

NEWS_USER = os.environ["ANN_NEWS_USER"]
NEWS_PASS = os.environ["ANN_NEWS_PASS"]

DEFAULT_FEED_URL = (
    "https://www.animenewsnetwork.com/newsfeed/getnews.php"
    f"?u={NEWS_USER}&p={NEWS_PASS}"
    "&filter=anime,people,just%20for%20fun,live-action"
)

ALLOWED_CATEGORIES = {"anime", "people", "just for fun", "live-action"}

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_ILLEGAL_XML = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]")
_AMP = re.compile(r"&(?!(?:amp|lt|gt|apos|quot|#\d+|#x[\da-fA-F]+);)")


def _clean_html(text: str) -> str:
    """Remove control characters and escape stray ampersands."""
    text = _ILLEGAL_XML.sub("", text)
    return _AMP.sub("&amp;", text)


def _fetch_feed(url: str = DEFAULT_FEED_URL) -> str:
    """Return the raw Newsfeed HTML fragment from ANN."""
    resp = requests.get(url, timeout=10, headers={"Accept": "text/html"})
    resp.raise_for_status()
    return _clean_html(resp.text)


def _parse_items(html_text: str) -> List[Dict[str, str]]:
    """Extract structured items from the Newsfeed HTML fragment."""
    soup = bs4.BeautifulSoup(html_text, "html.parser")
    items: List[Dict[str, str]] = []

    for p in soup.find_all("p"):
        bold = p.find("b")
        if not bold:
            continue

        link_tag = bold.find("a")
        if not link_tag or not link_tag.text:
            continue

        _, _, cat_part = bold.get_text(" ", strip=True).rpartition(" - ")
        category = cat_part.lower()

        description = _HTML_TAG_RE.sub("", p.get_text(" ", strip=True))
        description = description.split("]")[0].strip()

        items.append(
            {
                "title": link_tag.text.strip(),
                "link": link_tag["href"],
                "description": description,
                "category": category,
            }
        )
    return items


def fetch_latest_news_post(url: str = DEFAULT_FEED_URL) -> Optional[Dict[str, str]]:
    """
    Return the most recent Newsfeed entry whose category is in ``ALLOWED_CATEGORIES``.
    """
    try:
        html_text = _fetch_feed(url)
    except Exception as exc:
        logger.error("Could not download Newsfeed: %s", exc)
        return None

    for item in _parse_items(html_text):
        if item["category"] in ALLOWED_CATEGORIES:
            return {
                "title": item["title"],
                "link": item["link"],
                "description": item["description"],
            }

    logger.info("No matching posts found in Newsfeed.")
    return None


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda entry-point.

    Returns
    -------
    dict
        * ``status`` – ``post_found`` | ``no_post``
        * ``post_id`` – MD5 of the link (only when ``post_found``)
        * ``post`` – dict with ``title``, ``link``, ``description`` (only when
          ``post_found``)
    """
    post = fetch_latest_news_post()
    if post:
        post_id = hashlib.md5(post["link"].encode()).hexdigest()
        logger.info("Found post; id=%s", post_id)
        return {"status": "post_found", "post_id": post_id, "post": post}

    logger.info("No post found")
    return {"status": "no_post"}