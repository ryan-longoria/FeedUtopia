import hashlib
import logging
import urllib.request
import xml.etree.ElementTree as ET
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


RSS_FEED_URL = "https://www.techradar.com/rss"


def _download_feed(url: str) -> str:
    """Retrieve the raw XML for the RSS feed."""
    with urllib.request.urlopen(url, timeout=10) as resp:
        return resp.read().decode(resp.headers.get_content_charset() or "utf‑8")


def _parse_first_item(xml_text: str) -> Optional[Dict[str, str]]:
    """
    Parse the RSS XML and return the first <item> as a dict
    (title, link, description).  Returns None if no items found.
    """
    root = ET.fromstring(xml_text)

    channel = root.find("./channel")
    if channel is None:
        return None

    item = channel.find("./item")
    if item is None:
        return None

    def _text(tag: str) -> str:
        el = item.find(tag)
        return el.text.strip() if el is not None and el.text else ""

    return {
        "title": _text("title"),
        "link": _text("link"),
        "description": _text("description"),
    }


def fetch_post() -> Optional[Dict[str, str]]:
    """
    Download TechRadar’s RSS feed and return the newest post
    (title, link, description).  Returns None on any failure.
    """
    try:
        xml_text = _download_feed(RSS_FEED_URL)
        return _parse_first_item(xml_text)
    except Exception as exc:
        logger.warning("Failed to fetch/parse RSS feed: %s", exc)
        return None


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda entry point.
    If a new post is found AND its post_id differs from event.get("last_post_id")
    we return it; otherwise we reply with status 'no_post'.
    """
    last_seen_id = event.get("last_post_id")

    post = fetch_post()
    if not post:
        logger.info("No post found in RSS feed")
        return {"status": "no_post"}

    link = post["link"] or ""
    stable_post_id = hashlib.md5(link.encode("utf-8")).hexdigest()
    post["link_hash"] = stable_post_id

    if stable_post_id == last_seen_id:
        logger.info("Latest article already processed (post_id=%s)", stable_post_id)
        return {"status": "no_post"}

    logger.info("New article found; post_id=%s", stable_post_id)
    return {
        "status": "post_found",
        "post_id": stable_post_id,
        "post": post,
    }
