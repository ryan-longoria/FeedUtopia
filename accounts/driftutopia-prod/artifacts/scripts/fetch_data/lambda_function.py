import os
import hashlib
import logging
from typing import Dict, Any, Optional
import xml.etree.ElementTree as ET
from datetime import datetime
import requests

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DEFAULT_FEED_URL = "https://www.autonews.com/arc/outboundfeeds/sitemap-news/"


def fetch_latest_news_post(feed_url: str = DEFAULT_FEED_URL) -> Optional[Dict[str, str]]:
    """
    Fetch the most recent post (URL + title) from the XML sitemap feed.

    :param feed_url: The feed URL.
    :return: A dict with 'title' and 'link' if found, else None.
    """
    logger.debug(f"Fetching XML feed from: {feed_url}")
    try:
        response = requests.get(feed_url, timeout=10)
        response.raise_for_status()
    except Exception as e:
        logger.error("Failed to retrieve feed: %s", e)
        return None

    try:
        root = ET.fromstring(response.text)
    except ET.ParseError as pe:
        logger.error("Failed to parse XML: %s", pe)
        return None

    ns = {
        'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9',
        'news': 'http://www.google.com/schemas/sitemap-news/0.9'
    }

    url_elements = root.findall('sm:url', ns)
    if not url_elements:
        logger.info("No <url> elements found in the XML.")
        return None

    newest_el = None
    newest_date = None

    for el in url_elements:
        loc_el = el.find('sm:loc', ns)
        lastmod_el = el.find('sm:lastmod', ns)
        news_el = el.find('news:news', ns)

        if loc_el is None or lastmod_el is None or news_el is None:
            continue

        try:
            dt = datetime.fromisoformat(lastmod_el.text.replace("Z", "+00:00"))
        except ValueError:
            continue

        if newest_date is None or dt > newest_date:
            newest_el = el
            newest_date = dt

    if newest_el is None:
        logger.info("No valid <url> elements with lastmod & news:news found.")
        return None

    link_el = newest_el.find('sm:loc', ns)
    news_el = newest_el.find('news:news', ns)
    title_el = news_el.find('news:title', ns) if news_el is not None else None

    link_text = link_el.text.strip() if link_el is not None else ""
    title_text = title_el.text.strip() if title_el is not None else "No Title"

    return {
        "title": title_text,
        "link": link_text
    }


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler function that retrieves the most recent block and returns it,
    assigning a generated post ID if one is not supplied.

    Args:
        event (Dict[str, Any]): A dictionary containing the input data (e.g., "post_id").
        context (Any): The Lambda context object (not used here).

    Returns:
        Dict[str, Any]: A dictionary containing:
            - "status": A status message indicating whether a post was found.
            - "post_id": The generated MD5 of the link (or existing post_id).
            - "post": The post data if found: { "title", "link" }
    """
    feed_url = os.getenv("DRIFT_FEED_URL", DEFAULT_FEED_URL)
    post = fetch_latest_news_post(feed_url=feed_url)

    if post is not None:
        link = post["link"] or ""
        stable_post_id = hashlib.md5(link.encode("utf-8")).hexdigest()
        logger.info(f"Found newest post; stable_post_id={stable_post_id}")

        return {
            "status": "post_found",
            "post_id": stable_post_id,
            "post": post
        }

    logger.info("No post found")
    return {
        "status": "no_post"
    }
