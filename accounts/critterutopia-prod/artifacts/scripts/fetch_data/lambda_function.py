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
    Download the ScienceDaily Plants & Animals RSS feed (with a browser-style UA)
    and extract the newest item.
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
    try:
        resp = requests.get(FEED_URL, headers=headers, timeout=10)
        resp.raise_for_status()
    except Exception as exc:
        logger.warning("Could not download RSS feed: %s", exc, exc_info=True)
        return None

    try:
        root = ET.fromstring(resp.content)
        first_item = root.find("./channel/item")
        if first_item is None:
            return None

        def _text(tag: str) -> str:
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
