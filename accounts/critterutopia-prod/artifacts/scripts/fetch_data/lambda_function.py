import hashlib
import logging
import xml.etree.ElementTree as ET
from typing import Dict, Any, Optional
import requests

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

FEED_URL = "https://www.sciencedaily.com/rss/plants_animals.xml"


def fetch_post() -> Optional[Dict[str, str]]:
    """
    Download the ScienceDaily Plants & Animals RSS feed and extract the newest item.

    Returns:
        Dictionary with keys "title", "link", and "description",
        or None if the feed is empty or cannot be parsed.
    """
    try:
        resp = requests.get(FEED_URL, timeout=10)
        resp.raise_for_status()
    except Exception as exc:
        logger.warning("Could not download RSS feed: %s", exc, exc_info=True)
        return None

    try:
        root = ET.fromstring(resp.content)

        first_item = root.find("./channel/item")
        if first_item is None:
            return None

        def _text(tag):
            elem = first_item.find(tag)
            return elem.text.strip() if elem is not None and elem.text else ""

        post = {
            "title": _text("title"),
            "link": _text("link"),
            "description": _text("description"),
        }

        return post if post["link"] and post["title"] else None

    except ET.ParseError as exc:
        logger.warning("Failed to parse RSS XML: %s", exc, exc_info=True)
        return None


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda entry‑point.

    - Grabs a post from ScienceDaily.
    - Re‑uses a caller‑supplied post_id if provided, otherwise generates a stable MD5 of the link.
    - Always returns keys: "status", "post_id" (if found), and optionally "post".
    """
    post = fetch_post()

    if post:
        supplied_id = event.get("post_id")
        stable_post_id = supplied_id or hashlib.md5(post["link"].encode("utf-8")).hexdigest()

        logger.info("Found ScienceDaily post; using post_id=%s", stable_post_id)

        return {
            "status": "post_found",
            "post_id": stable_post_id,
            "post": post,
        }

    logger.info("No post found in RSS feed")
    return {"status": "no_post"}
