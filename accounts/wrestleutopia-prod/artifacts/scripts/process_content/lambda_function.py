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


def class_lambda(value: str) -> bool:
    """Helper for BeautifulSoup to match 'wikitable' classes."""
    return value and ("wikitable" in value)


def fetch_wwe_roster() -> Dict[str, str]:
    """
    Fetch the 'List_of_WWE_personnel' page via Wikipedia's Action API,
    parse the HTML, and return a dict {wrestler_name: relative_url}.
    e.g. {"Cody Rhodes": "/wiki/Cody_Rhodes", ...}
    """
    logger.info("Fetching WWE roster from 'List_of_WWE_personnel'.")
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
        logger.error("Failed to fetch WWE roster page.", exc_info=True)
        raise

    data = resp.json()
    if ("parse" not in data
            or "text" not in data["parse"]
            or "*" not in data["parse"]["text"]):
        logger.warning("Unexpected JSON structure for 'List_of_WWE_personnel'.")
        return {}

    raw_html = data["parse"]["text"]["*"]
    soup = BeautifulSoup(raw_html, "html.parser")

    navbox = soup.find("div", id=lambda x: x and x.startswith("WWE_personnel"))
    if not navbox:
        logger.warning("Could not find 'WWE_personnel' navbox in HTML.")
        return {}

    all_subgroup_tables = navbox.find_all("table", class_="navbox-subgroup")
    logger.debug("Found %d <table class='navbox-subgroup'> elements.", len(all_subgroup_tables))

    roster_dict = {}
    for table_idx, table in enumerate(all_subgroup_tables, start=1):
        rows = table.find_all("tr")
        for tr in rows:
            heading_th = tr.find("th", class_="navbox-group")
            if not heading_th:
                continue
            heading_text = heading_th.get_text(strip=True)
            if heading_text in ["Men's division", "Women's division"]:
                td = tr.find("td", class_="navbox-list")
                if not td:
                    continue
                for li in td.find_all("li"):
                    a = li.find("a", href=True, title=True)
                    if a:
                        name = a.get_text(strip=True)
                        href = a.get("href", "")
                        if (name
                                and not name.startswith("^")
                                and href.startswith("/wiki/")):
                            roster_dict[name] = href

    logger.info("Completed parsing roster. Found %d wrestlers.", len(roster_dict))
    return roster_dict


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
    if ("parse" not in data
            or "text" not in data["parse"]
            or "*" not in data["parse"]["text"]):
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


def find_all_matches_in_title(
    title: str, roster_dict: Dict[str, str], events_list: List[str]
) -> Tuple[List[str], List[str]]:
    """
    Search 'title' for each wrestler name (from roster_dict) and each event (from events_list)
    using a case-insensitive substring match.
    Return two lists:
       1) 'matched_wrestlers' – the wrestler names that appear in title
       2) 'matched_events' – the events that appear in title
    """
    logger.info("Searching for matches in title: '%s'", title)
    matched_wrestlers = []
    matched_events = []

    lower_title = title.lower()

    for wrestler_name in roster_dict.keys():
        if wrestler_name.lower() in lower_title:
            logger.debug("Matched wrestler: '%s'", wrestler_name)
            matched_wrestlers.append(wrestler_name)

    for event_name in events_list:
        if event_name.lower() in lower_title:
            logger.debug("Matched event: '%s'", event_name)
            matched_events.append(event_name)

    logger.info("Found %d wrestler matches and %d event matches in title.",
                len(matched_wrestlers), len(matched_events))
    return matched_wrestlers, matched_events


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler:
      1) Validates 'post' data in the event.
      2) Fetches the WWE roster (dict of name->URL) and event list.
      3) Searches post['title'] for any mention of wrestlers or events.
      4) For each matched wrestler, fetches their page and grabs their infobox image.
      5) Attaches all data to post (including 'wrestler_images').
      6) Returns the processed post.
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
        wwe_roster_dict = fetch_wwe_roster()
        wwe_events = fetch_wwe_events()

        matched_wrestlers, matched_events = find_all_matches_in_title(
            post["title"], wwe_roster_dict, wwe_events
        )

        wrestler_images = {}
        for wrestler_name in matched_wrestlers:
            rel_url = wwe_roster_dict.get(wrestler_name, "")
            if rel_url:
                local_image_path = fetch_wrestler_image(rel_url)
                if local_image_path:
                    wrestler_images[wrestler_name] = local_image_path

        post["matched_wrestlers"] = matched_wrestlers
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
