import os
import logging
from typing import Any, Dict, List

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

IMAGE_MAGICK_EXE = os.environ.get("IMAGE_MAGICK_EXE", "/bin/magick")


def fetch_wwe_roster() -> List[str]:
    """
    Fetch the 'List_of_WWE_personnel' page via the Wikipedia Action API,
    parse the HTML, and return a list of wrestler names found in the navbox
    under the Men's/Women's divisions.
    """
    logger.info("Starting to fetch the WWE roster from Wikipedia (List_of_WWE_personnel).")
    wiki_api_url = "https://en.wikipedia.org/w/api.php"
    params = {
        "action": "parse",
        "page": "List_of_WWE_personnel",
        "prop": "text",
        "format": "json",
    }
    try:
        logger.debug(f"Making GET request to {wiki_api_url} with params={params}")
        resp = requests.get(wiki_api_url, params=params, timeout=10)
        resp.raise_for_status()
        logger.info("Successfully fetched 'List_of_WWE_personnel' page from Wikipedia.")
    except Exception as e:
        logger.error("Error during requests.get or resp.raise_for_status()", exc_info=True)
        raise

    data = resp.json()

    logger.debug(f"Response JSON keys: {list(data.keys())}")
    if "parse" not in data or "text" not in data["parse"] or "*" not in data["parse"]["text"]:
        logger.warning("Wikipedia data structure is unexpected! 'parse' or 'text' key missing.")
        return []

    raw_html = data["parse"]["text"]["*"]
    soup = BeautifulSoup(raw_html, "html.parser")

    logger.debug("Searching for <div> whose id starts with 'WWE_personnel'...")
    wwe_personnel_navbox = soup.find("div", id=lambda x: x and x.startswith("WWE_personnel"))
    if not wwe_personnel_navbox:
        logger.warning("Could not find 'WWE_personnel' navbox on the 'List_of_WWE_personnel' page.")
        return []

    wrestler_names = set()

    all_subgroup_tables = wwe_personnel_navbox.find_all("table", class_="navbox-subgroup")
    logger.debug(f"Found {len(all_subgroup_tables)} <table class='navbox-subgroup'> elements.")

    for table_idx, table in enumerate(all_subgroup_tables, start=1):
        logger.debug(f"Processing table #{table_idx}")
        all_rows = table.find_all("tr")
        logger.debug(f"Found {len(all_rows)} <tr> in table #{table_idx}")
        for tr in all_rows:
            heading_th = tr.find("th", class_="navbox-group")
            if not heading_th:
                continue

            heading_text = heading_th.get_text(strip=True)
            logger.debug(f"Found heading: {heading_text}")
            if heading_text in ["Men's division", "Women's division"]:
                td = tr.find("td", class_="navbox-list")
                if not td:
                    logger.debug("No matching <td> found under this heading. Skipping.")
                    continue
                li_tags = td.find_all("li")
                logger.debug(f"Found {len(li_tags)} <li> elements under {heading_text}")
                for li in li_tags:
                    a = li.find("a", href=True, title=True)
                    if a:
                        name = a.get_text(strip=True)
                        if name and not name.startswith("^"):
                            wrestler_names.add(name)

    logger.info(f"Finished parsing roster. Found {len(wrestler_names)} unique wrestler names.")
    return sorted(wrestler_names)


def class_lambda(value: str) -> bool:
    """Helper function to match 'wikitable' (optionally 'sortable') classes."""
    return value and ("wikitable" in value)


def fetch_wwe_events() -> List[str]:
    """
    Fetch the 'List_of_WWE_pay-per-view_and_livestreaming_supercards' page
    via the Wikipedia Action API, parse the HTML, and return a list of event
    names from the 'Event' column in each 'wikitable'.
    """
    logger.info("Starting to fetch WWE events from Wikipedia (List_of_WWE_pay-per-view...).")
    wiki_api_url = "https://en.wikipedia.org/w/api.php"
    params = {
        "action": "parse",
        "page": "List_of_WWE_pay-per-view_and_livestreaming_supercards",
        "prop": "text",
        "format": "json",
    }
    try:
        logger.debug(f"Making GET request to {wiki_api_url} with params={params}")
        resp = requests.get(wiki_api_url, params=params, timeout=10)
        resp.raise_for_status()
        logger.info("Successfully fetched 'List_of_WWE_pay-per-view_and_livestreaming_supercards'.")
    except Exception as e:
        logger.error("Error during requests.get or resp.raise_for_status()", exc_info=True)
        raise

    data = resp.json()

    logger.debug(f"Response JSON keys: {list(data.keys())}")
    if "parse" not in data or "text" not in data["parse"] or "*" not in data["parse"]["text"]:
        logger.warning("Wikipedia event page structure is unexpected! 'parse' or 'text' missing.")
        return []

    raw_html = data["parse"]["text"]["*"]
    soup = BeautifulSoup(raw_html, "html.parser")

    wikitables = soup.find_all("table", class_lambda)
    logger.debug(f"Found {len(wikitables)} tables with class 'wikitable'.")

    event_names = set()

    for table_idx, table in enumerate(wikitables, start=1):
        logger.debug(f"Processing wikitable #{table_idx}")
        rows = table.find_all("tr")
        logger.debug(f"Table #{table_idx} has {len(rows)} <tr> rows.")

        if not rows:
            continue

        header_cells = rows[0].find_all(["th", "td"])
        event_col_idx = None
        for idx, header_cell in enumerate(header_cells):
            header_text = header_cell.get_text(strip=True).lower()
            if "event" in header_text:
                event_col_idx = idx
                logger.debug(f"'Event' column found at index={event_col_idx} in table #{table_idx}")
                break

        if event_col_idx is None:
            logger.debug(f"No 'Event' column found in table #{table_idx}. Skipping.")
            continue

        for row_idx, row in enumerate(rows[1:], start=2):
            cells = row.find_all(["td", "th"])
            if len(cells) <= event_col_idx:
                continue

            event_cell = cells[event_col_idx]
            event_link = event_cell.find("a", href=True, title=True)
            if event_link:
                event_text = event_link.get_text(strip=True)
            else:
                event_text = event_cell.get_text(strip=True)

            if event_text:
                event_names.add(event_text)
                logger.debug(f"Row #{row_idx}: Found event '{event_text}'.")

    logger.info(f"Finished parsing events. Found {len(event_names)} unique events.")
    return sorted(event_names)


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Process the incoming event containing post data.

    1) Checks for the "post" data within the event.
    2) If missing, return an error.
    3) Otherwise, fetch the WWE roster & events from Wikipedia.
    4) Attach them to the 'post' object.
    5) Fill placeholders for title, description, image_path.
    6) Return the processed result.
    """
    logger.info("Lambda handler invoked. Checking for 'post' in the event...")

    post = event.get("post") or event.get("processedContent", {}).get("post")
    if not post or not isinstance(post, dict):
        error_msg = "No valid 'post' data found in event."
        logger.error(error_msg)
        return {"status": "error", "error": error_msg}

    logger.info("Post object found. Proceeding to fetch WWE data from Wikipedia.")

    try:
        wwe_roster = fetch_wwe_roster()
        logger.debug(f"WWE roster returned: {wwe_roster}")

        wwe_events = fetch_wwe_events()
        logger.debug(f"WWE events returned: {wwe_events}")

        post["wrestler_names"] = wwe_roster
        post["events"] = wwe_events

    except Exception as e:
        logger.exception("Failed to fetch or parse Wikipedia data.")
        return {"status": "error", "error": str(e)}

    post["title"] = ""
    post["description"] = ""
    post["image_path"] = ""
    logger.info("Filled post placeholders (title, description, image_path).")

    logger.info("Lambda processing complete. Returning success.")
    return {"status": "processed", "post": post}
