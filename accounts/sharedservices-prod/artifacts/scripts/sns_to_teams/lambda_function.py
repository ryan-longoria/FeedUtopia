import os
import json
import logging
from typing import Any, Dict

import urllib3
from urllib3.exceptions import HTTPError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

http = urllib3.PoolManager()

def post_to_teams(webhook_url: str, message: str) -> None:
    """
    Post a message to a Microsoft Teams channel via the given webhook URL.

    :param webhook_url: The Microsoft Teams webhook URL.
    :type webhook_url: str
    :param message: The message to send to Teams.
    :type message: str
    :raises HTTPError: If the request to Teams fails at the HTTP level.
    :raises Exception: If Teams does not return a 2xx status code.
    """
    body = {"text": message}
    encoded_body = json.dumps(body).encode("utf-8")

    try:
        resp = http.request(
            "POST",
            webhook_url,
            body=encoded_body,
            headers={"Content-Type": "application/json"}
        )
    except HTTPError as exc:
        logger.error("HTTP error occurred when posting to Teams: %s", exc)
        raise

    logger.info("Teams responded with status %s", resp.status)
    if not 200 <= resp.status < 300:
        logger.error("Error posting to Teams: %s, %s", resp.status, resp.data)
        raise Exception(f"Failed to post message to Teams: {resp.status}")


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler that receives SNS notifications about CloudWatch Alarms
    and sends a message to a configured Microsoft Teams webhook.

    :param event: The AWS Lambda event, typically containing SNS messages.
    :type event: dict
    :param context: The AWS Lambda context (unused here).
    :type context: object
    :return: A dictionary containing the status of message postings.
    :rtype: dict
    """
    teams_webhook_url = os.getenv("TEAMS_WEBHOOK_URL")
    if not teams_webhook_url:
        logger.error("TEAMS_WEBHOOK_URL not found in environment variables.")
        raise ValueError("TEAMS_WEBHOOK_URL is required but not set.")

    results = []

    for record in event.get("Records", []):
        sns_message = record.get("Sns", {}).get("Message", "No message found")
        message = f"A CloudWatch Alarm has triggered:\n\n{sns_message}"

        try:
            post_to_teams(teams_webhook_url, message)
            results.append({"status": "success", "message": sns_message})
        except Exception as exc:
            logger.exception("Failed to post SNS message to Teams")
            results.append({"status": "failed", "error": str(exc), "message": sns_message})

    return {"results": results}
