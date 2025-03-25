import os
import re
import subprocess
import logging
from typing import Any, Dict, List, Tuple
import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

IMAGE_MAGICK_EXE = os.environ.get("IMAGE_MAGICK_EXE", "/bin/magick")


def download_image(url: str) -> str:
    """
    Download an image from 'url', save it locally, then attempt to convert it
    using ImageMagick. Return the path to the (converted) image.
    """
    if not url:
        logger.warning("No image URL provided.")
        return ""
    file_path = os.path.join(os.getcwd(), "wrestler_image.jpg")
    try:
        logger.info("Downloading image from: %s", url)
        response = requests.get(url, stream=True, headers={"User-Agent": "Mozilla/5.0"})
        response.raise_for_status()
        with open(file_path, "wb") as f:
            for chunk in response.iter_content(1024):
                f.write(chunk)
        logger.info("Image saved to: %s", file_path)
        file_size = os.path.getsize(file_path)
        logger.info("Downloaded file size: %d bytes", file_size)
        if file_size < 1000:
            logger.error("File size too small, likely incomplete download.")
            return ""
        converted_path = "/tmp/wrestler_image_converted.jpg"
        try:
            subprocess.run([IMAGE_MAGICK_EXE, file_path, converted_path], check=True)
            logger.info("ImageMagick conversion succeeded. Output: %s", converted_path)
            return converted_path
        except Exception as exc:
            logger.error("ImageMagick conversion failed: %s", exc)
            return file_path
    except Exception as exc:
        logger.error("Failed to download image: %s", exc)
        return ""


def fetch_wrestler_image(relative_url: str) -> str:
    """
    Given a Wikipedia 'relative_url' (e.g. '/wiki/Cody_Rhodes'),
    visit that page, parse the infobox image, download & convert it.
    Return the path to the local image file (or '') on failure.
    """
    if not relative_url.startswith("/wiki/"):
        logger.warning("Expected a /wiki/ URL but got: %s", relative_url)
        return ""
    full_url = "https://en.wikipedia.org" + relative_url
    logger.info("Fetching wrestler page: %s", full_url)
    try:
        resp = requests.get(full_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        resp.raise_for_status()
    except Exception as exc:
        logger.error("Error fetching wrestler page (%s): %s", full_url, exc, exc_info=True)
        return ""
    soup = BeautifulSoup(resp.text, "html.parser")
    infobox = soup.find("table", class_="infobox vcard")
    if not infobox:
        logger.warning("No infobox vcard found on %s", full_url)
        return ""
    image_td = infobox.find("td", class_="infobox-image")
    if not image_td:
        logger.warning("Infobox found, but no 'infobox-image' cell on %s", full_url)
        return ""
    img_tag = image_td.find("img")
    if not img_tag:
        logger.warning("No <img> tag in 'infobox-image' for %s", full_url)
        return ""
    src = img_tag.get("src")
    if not src:
        logger.warning("No 'src' attribute found in <img> on %s", full_url)
        return ""
    if src.startswith("//"):
        image_url = "https:" + src
    elif src.startswith("http"):
        image_url = src
    else:
        image_url = "https://en.wikipedia.org" + src
    logger.info("Found wrestler image URL: %s", image_url)
    return download_image(image_url)


def fetch_wwe_roster_all_navboxes() -> List[Dict[str, str]]:
    """
    Fetch the 'List_of_WWE_personnel' page via Wikipedia's Action API,
    parse EVERY <table class="navbox"> on the page, and also parse the
    main 'wikitable' roster to collect ring_name, real_name, and href.
    """
    logger.info("Fetching data from 'List_of_WWE_personnel' for ALL navboxes.")
    api_url = "https://en.wikipedia.org/w/api.php"
    params = {
        "action": "parse",
        "page": "List_of_WWE_personnel",
        "prop": "text",
        "format": "json",
    }
    try:
        resp = requests.get(api_url, params=params, timeout=10)
        resp.raise_for_status()
    except Exception as exc:
        logger.error("Failed to fetch page: %s", exc, exc_info=True)
        raise
    data = resp.json()
    if ("parse" not in data) or ("text" not in data["parse"]) or ("*" not in data["parse"]["text"]):
        logger.warning("Unexpected JSON structure for 'List_of_WWE_personnel'.")
        return []
    raw_html = data["parse"]["text"]["*"]
    soup = BeautifulSoup(raw_html, "html.parser")
    all_navboxes = soup.find_all("table", class_="navbox")
    logger.info("Found %d <table class='navbox'> elements on the page.", len(all_navboxes))
    results = []
    for navbox_idx, navbox in enumerate(all_navboxes, start=1):
        subgroups = navbox.find_all("table", class_="navbox-subgroup")
        logger.debug("Navbox #%d has %d <table class='navbox-subgroup'>.", navbox_idx, len(subgroups))
        for subgroup_idx, subgroup_table in enumerate(subgroups, start=1):
            rows = subgroup_table.find_all("tr")
            logger.debug(
                "Navbox #%d, subgroup #%d has %d <tr> rows.",
                navbox_idx, subgroup_idx, len(rows)
            )
            for tr_idx, tr in enumerate(rows, start=1):
                td = tr.find("td", class_="navbox-list")
                if not td:
                    continue
                li_tags = td.find_all("li")
                logger.debug(
                    "Navbox #%d, subgroup #%d, tr #%d => found %d <li> items.",
                    navbox_idx, subgroup_idx, tr_idx, len(li_tags)
                )
                for li in li_tags:
                    a = li.find("a", href=True, title=True)
                    if not a:
                        continue
                    ring_name = a.get_text(strip=True)
                    real_name = a["title"]
                    href = a["href"]
                    if (ring_name and not ring_name.startswith("^") and href.startswith("/wiki/")):
                        results.append({
                            "ring_name": ring_name,
                            "real_name": real_name,
                            "href": href
                        })
    main_tables = soup.find_all("table", class_="wikitable")
    for table in main_tables:
        rows = table.find_all("tr")
        for row in rows[1:]:
            cells = row.find_all("td")
            if len(cells) < 2:
                continue
            ring_td = cells[0]
            real_td = cells[1]
            link = ring_td.find("a", href=True, title=True)
            if link:
                ring_name = link.get_text(strip=True)
                href = link["href"]
                real_name = real_td.get_text(strip=True)
                if ring_name and href.startswith("/wiki/"):
                    results.append({
                        "ring_name": ring_name,
                        "real_name": real_name,
                        "href": href
                    })
    logger.info("Completed all navbox + wikitable parsing. Found %d total entries.", len(results))
    return results


def class_lambda(value: str) -> bool:
    """
    Helper for BeautifulSoup to match 'wikitable' classes.
    """
    return value and ("wikitable" in value)


def fetch_wwe_events() -> List[str]:
    """
    Fetch 'List_of_WWE_pay-per-view_and_livestreaming_supercards' via Wikipedia's Action API,
    parse the HTML, and return a list of event names (strings).
    """
    logger.info("Fetching WWE events from 'List_of_WWE_pay-per-view_and_livestreaming_supercards'.")
    api_url = "https://en.wikipedia.org/w/api.php"
    params = {
        "action": "parse",
        "page": "List_of_WWE_pay-per-view_and_livestreaming_supercards",
        "prop": "text",
        "format": "json",
    }
    try:
        resp = requests.get(api_url, params=params, timeout=10)
        resp.raise_for_status()
    except Exception as exc:
        logger.error("Failed to fetch WWE events page.", exc_info=True)
        raise
    data = resp.json()
    if ("parse" not in data or "text" not in data["parse"] or "*" not in data["parse"]["text"]):
        logger.warning("Unexpected JSON structure for pay-per-view events page.")
        return []
    raw_html = data["parse"]["text"]["*"]
    soup = BeautifulSoup(raw_html, "html.parser")
    wikitables = soup.find_all("table", class_lambda)
    logger.debug("Found %d tables with class 'wikitable'.", len(wikitables))
    event_names = set()
    for table in wikitables:
        rows = table.find_all("tr")
        if not rows:
            continue
        header_cells = rows[0].find_all(["th", "td"])
        event_col_idx = None
        for idx, cell in enumerate(header_cells):
            header_text = cell.get_text(strip=True).lower()
            if "event" in header_text:
                event_col_idx = idx
                break
        if event_col_idx is None:
            continue
        for row in rows[1:]:
            cells = row.find_all(["td", "th"])
            if len(cells) <= event_col_idx:
                continue
            event_cell = cells[event_col_idx]
            link = event_cell.find("a", href=True, title=True)
            if link:
                text = link.get_text(strip=True)
            else:
                text = event_cell.get_text(strip=True)
            if text:
                event_names.add(text)
    logger.info("Completed parsing events. Found %d unique events.", len(event_names))
    return sorted(event_names)


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler:
      1) Validates 'post' data in the event.
      2) Fetches *all navbox entries* + main table from 'List_of_WWE_personnel'.
      3) Fetches the event list from 'List_of_WWE_pay-per-view_and_livestreaming_supercards'.
      4) Searches post['title'] for ring_name or real_name substring matches.
      5) For each matched name, fetch the infobox image (if available).
      6) Attaches these matches to the post, returns the result.
    """
    logger.info("Lambda handler invoked. Checking for 'post' in the event.")
    post = event.get("post") or event.get("processedContent", {}).get("post")
    if not post or not isinstance(post, dict):
        error_msg = "No valid 'post' data found in event."
        logger.error(error_msg)
        return {"status": "error", "error": error_msg}
    post.setdefault("title", "")
    logger.info("Post title: '%s'", post["title"])
    try:
        wwe_entries = fetch_wwe_roster_all_navboxes()
        wwe_events = fetch_wwe_events()
        title_lower = post["title"].lower()
        matched_names = []
        matched_cache = set()
        for item in wwe_entries:
            ring_name_lower = item["ring_name"].lower()
            real_name_lower = item["real_name"].lower()
            ring_name_found = ring_name_lower in title_lower
            real_name_found = real_name_lower in title_lower
            if ring_name_found or real_name_found:
                if ring_name_found and item["ring_name"] not in matched_cache:
                    matched_names.append(item["ring_name"])
                    matched_cache.add(item["ring_name"])
                if real_name_found and item["real_name"] not in matched_cache:
                    matched_names.append(item["real_name"])
                    matched_cache.add(item["real_name"])
        matched_events = []
        for ev in wwe_events:
            if ev.lower() in title_lower:
                matched_events.append(ev)
        name_to_href = {}
        for item in wwe_entries:
            name_to_href[item["ring_name"]] = item["href"]
            name_to_href[item["real_name"]] = item["href"]
        wrestler_images = {}
        for name_str in matched_names:
            rel_url = name_to_href.get(name_str)
            if rel_url:
                local_img_path = fetch_wrestler_image(rel_url)
                if local_img_path:
                    wrestler_images[name_str] = local_img_path
        post["matched_names"] = matched_names
        post["matched_events"] = matched_events
        post["wrestler_images"] = wrestler_images
    except Exception as exc:
        logger.exception("An error occurred while processing Wikipedia data.")
        return {"status": "error", "error": str(exc)}
    post.setdefault("description", "")
    post.setdefault("image_path", "")
    logger.info("Lambda processing complete. Returning success.")
    return {
        "status": "processed",
        "post": post
    }
