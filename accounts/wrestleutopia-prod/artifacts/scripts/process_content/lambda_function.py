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
    Fetch the 'List_of_WWE_personnel' page via Wikipedia's Action API.
    Parse the HTML and return a list of wrestler names found in the navbox
    under the men's/women's divisions.
    """
    logger.info("Fetching WWE roster from 'List_of_WWE_personnel'.")
    wiki_api_url = "https://en.wikipedia.org/w/api.php"
    params = {
        "action": "parse",
        "page": "List_of_WWE_personnel",
        "prop": "text",
        "format": "json",
    }

    try:
        logger.debug("Sending GET request to fetch roster data.")
        resp = requests.get(wiki_api_url, params=params, timeout=10)
        resp.raise_for_status()
        logger.info("Successfully fetched 'List_of_WWE_personnel' page from Wikipedia.")
    except Exception as exc:
        logger.error("Failed to fetch WWE roster.", exc_info=True)
        raise

    data = resp.json()

    if ("parse" not in data
            or "text" not in data["parse"]
            or "*" not in data["parse"]["text"]):
        logger.warning("Unexpected JSON structure for 'List_of_WWE_personnel'.")
        return []

    raw_html = data["parse"]["text"]["*"]
    soup = BeautifulSoup(raw_html, "html.parser")

    navbox = soup.find("div", id=lambda x: x and x.startswith("WWE_personnel"))
    if not navbox:
        logger.warning("Could not find 'WWE_personnel' navbox in the HTML.")
        return []

    all_subgroup_tables = navbox.find_all("table", class_="navbox-subgroup")
    logger.debug("Found %d <table class='navbox-subgroup'> elements.", 
                 len(all_subgroup_tables))

    wrestler_names = set()
    for table_idx, table in enumerate(all_subgroup_tables, start=1):
        logger.debug("Processing table #%d for rosters.", table_idx)
        all_rows = table.find_all("tr")
        logger.debug("Table #%d has %d <tr> rows.", table_idx, len(all_rows))

        for tr in all_rows:
            heading_th = tr.find("th", class_="navbox-group")
            if not heading_th:
                continue
            heading_text = heading_th.get_text(strip=True)
            logger.debug("Heading found: '%s'.", heading_text)

            if heading_text in ["Men's division", "Women's division"]:
                td = tr.find("td", class_="navbox-list")
                if not td:
                    logger.debug("No <td> found under heading '%s'. Skipping.", 
                                 heading_text)
                    continue

                li_tags = td.find_all("li")
                logger.debug(
                    "Found %d <li> elements under heading '%s'.",
                    len(li_tags), heading_text
                )
                for li in li_tags:
                    a = li.find("a", href=True, title=True)
                    if a:
                        name = a.get_text(strip=True)
                        if name and not name.startswith("^"):
                            wrestler_names.add(name)

    logger.info("Completed roster parse. Found %d unique wrestlers.",
                len(wrestler_names))
    return sorted(wrestler_names)


def class_lambda(value: str) -> bool:
    """
    Helper for BeautifulSoup to match 'wikitable' or something containing
    the 'wikitable' class. Adjust if needed for 'sortable' or other classes.
    """
    return value and ("wikitable" in value)


def fetch_wwe_events() -> List[str]:
    """
    Fetch the 'List_of_WWE_pay-per-view_and_livestreaming_supercards' page 
    via Wikipedia's Action API. Parse the HTML and return a list of event 
    names found in the 'Event' column of each 'wikitable'.
    """
    logger.info(
        "Fetching WWE events from 'List_of_WWE_pay-per-view_and_livestreaming_supercards'."
    )
    wiki_api_url = "https://en.wikipedia.org/w/api.php"
    params = {
        "action": "parse",
        "page": "List_of_WWE_pay-per-view_and_livestreaming_supercards",
        "prop": "text",
        "format": "json",
    }

    try:
        logger.debug("Sending GET request to fetch events data.")
        resp = requests.get(wiki_api_url, params=params, timeout=10)
        resp.raise_for_status()
        logger.info("Successfully fetched 'List_of_WWE_pay-per-view...' page from Wikipedia.")
    except Exception as exc:
        logger.error("Failed to fetch WWE events.", exc_info=True)
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
    for tbl_idx, table in enumerate(wikitables, start=1):
        rows = table.find_all("tr")
        logger.debug("Table #%d has %d rows.", tbl_idx, len(rows))
        if not rows:
            continue

        header_cells = rows[0].find_all(["th", "td"])
        event_col_idx = None
        for idx, cell in enumerate(header_cells):
            header_text = cell.get_text(strip=True).lower()
            if "event" in header_text:
                event_col_idx = idx
                logger.debug("'Event' column found at index %d in table #%d.",
                             event_col_idx, tbl_idx)
                break

        if event_col_idx is None:
            logger.debug("No 'Event' column found in table #%d. Skipping.", tbl_idx)
            continue

        for row_idx, row in enumerate(rows[1:], start=1):
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
                logger.debug("Row #%d in table #%d: found event '%s'.",
                             row_idx, tbl_idx, event_text)

    logger.info("Completed events parse. Found %d unique events.",
                len(event_names))
    return sorted(event_names)


def find_all_matches_in_title(
    title: str, roster_list: List[str], events_list: List[str]
) -> List[str]:
    """
    Search 'title' for each item from both 'roster_list' and 'events_list'
    using a case-insensitive substring match.
    Return ALL matches found (do NOT stop after the first).
    """
    logger.debug("Searching title for matches. Title='%s'", title)
    found_matches = []
    lower_title = title.lower()

    for name in roster_list:
        if name.lower() in lower_title:
            logger.debug("Matched wrestler: '%s'", name)
            found_matches.append(name)

    for event_name in events_list:
        if event_name.lower() in lower_title:
            logger.debug("Matched event: '%s'", event_name)
            found_matches.append(event_name)

    logger.info("Found %d matches in title.", len(found_matches))
    return found_matches


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler that:
      1) Retrieves 'post' data from event.
      2) Fetches WWE roster & events from Wikipedia.
      3) Attaches them to 'post' and finds all matches in 'post["title"]'.
      4) Returns the processed post in the response.
    """
    logger.info("Lambda handler invoked. Checking for 'post' in the event.")
    post = event.get("post") or event.get("processedContent", {}).get("post")

    if not post or not isinstance(post, dict):
        error_msg = "No valid 'post' data found in event."
        logger.error(error_msg)
        return {"status": "error", "error": error_msg}

    try:
        logger.info("Fetching data from Wikipedia (roster + events).")
        wwe_roster = fetch_wwe_roster()
        wwe_events = fetch_wwe_events()

        post["wrestler_names"] = wwe_roster
        post["events"] = wwe_events

        title_text = post.get("title", "")
        found_matches = find_all_matches_in_title(title_text, wwe_roster, wwe_events)
        post["found_matches"] = found_matches

    except Exception as exc:
        logger.exception("An error occurred while processing Wikipedia data.")
        return {"status": "error", "error": str(exc)}

    if "title" not in post:
        post["title"] = ""
    post["description"] = ""
    post["image_path"] = ""

    logger.info("Lambda processing complete. Returning success.")
    return {
        "status": "processed",
        "post": post
    }
