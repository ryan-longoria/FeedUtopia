import json
import logging
import os
from typing import Any, Dict, Optional

import boto3
import requests
from botocore.exceptions import ClientError

TEAMS_WEBHOOKS_ENV_VAR = "TEAMS_WEBHOOKS_JSON"
TARGET_BUCKET_ENV_VAR = "TARGET_BUCKET"

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def get_environment_variables() -> Dict[str, str]:
    """
    Retrieves and returns all necessary environment variables.
    Raises ValueError if any required environment variable is missing.
    """
    teams_webhooks_json = os.environ.get(TEAMS_WEBHOOKS_ENV_VAR)
    if not teams_webhooks_json:
        raise ValueError(f"{TEAMS_WEBHOOKS_ENV_VAR} not found in environment.")

    target_bucket = os.environ.get(TARGET_BUCKET_ENV_VAR)

    return {
        "teams_webhooks_json": teams_webhooks_json,
        "target_bucket": target_bucket,
    }


def get_teams_webhook_url(
    teams_webhooks: Dict[str, Dict[str, str]], account_name: str
) -> str:
    """
    Retrieves the Teams webhook URL for a given account name.
    
    :param teams_webhooks: A dict of accountName -> { "manual": "url" }
    :param account_name: The name of the account.
    :return: The webhook URL (string).
    :raises KeyError: If the accountName or "manual" key is not found.
    """
    return teams_webhooks[account_name]["manual"]


def generate_presigned_s3_url(
    bucket: str, key: str, expiration: int = 604800
) -> Optional[str]:
    """
    Generates a presigned URL for an S3 object.

    :param bucket: Name of the S3 bucket.
    :param key: The S3 object key.
    :param expiration: Link expiration in seconds (default: 604800 = 7 days).
    :return: The presigned URL if successful, otherwise None.
    """
    s3 = boto3.client("s3")
    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expiration
        )
        return url
    except ClientError as exc:
        logger.exception("Error generating presigned URL for %s/%s: %s", bucket, key, exc)
        return None


def post_to_teams(webhook_url: str, message: str, timeout: int = 20) -> None:
    """
    Posts a message to a Microsoft Teams webhook.

    :param webhook_url: The Teams webhook URL.
    :param message: The message to send.
    :param timeout: Timeout in seconds for the request.
    :raises requests.HTTPError: If the POST request is unsuccessful.
    """
    payload = {"text": message}
    resp = requests.post(
        webhook_url, 
        headers={"Content-Type": "application/json"}, 
        data=json.dumps(payload),
        timeout=timeout
    )
    resp.raise_for_status()


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Posts a Teams message when a video or weekly‑news image is ready.

    Expects in the event:
        • accountName               – required
        • videoResult.video_key     – for regular video posts   (old flow)
        • media_key                 – for image‑based recap     (new flow)
        • postType                  – "weekly_news" or omitted/other

    Environment variables (set in Terraform):
        • TEAMS_WEBHOOKS_JSON
        • TARGET_BUCKET
    """
    try:
        env_vars = get_environment_variables()
    except ValueError as err:
        logger.error(str(err))
        return {"error": str(err)}

    account_name = event.get("accountName")
    if not account_name:
        msg = "No accountName found in event input."
        logger.error(msg)
        return {"error": msg}

    try:
        teams_webhooks = json.loads(env_vars["teams_webhooks_json"])
        teams_webhook_url = get_teams_webhook_url(teams_webhooks, account_name)
    except (json.JSONDecodeError, KeyError) as err:
        msg = f"Failed to get webhook URL for account '{account_name}': {err}"
        logger.error(msg)
        return {"error": msg}

    post_type  = (event.get("postType") or "regular").lower()
    is_weekly  = post_type == "weekly_news"

    media_key = (
        event.get("media_key")
        or event.get("videoResult", {}).get("video_key")
    )
    if not media_key:
        logger.warning("No media_key/video_key in event; message will have no link")
        media_key = "No media key?"

    presigned_url = None
    if env_vars["target_bucket"] and isinstance(media_key, str):
        presigned_url = generate_presigned_s3_url(
            env_vars["target_bucket"], media_key
        )

    descriptor = "weekly news post" if is_weekly else "new post"
    link_label = "View Image"        if is_weekly else "View Video"

    if presigned_url:
        message_text = (
            f"Your {descriptor} is ready! \n\n[{link_label}]({presigned_url})"
        )
    else:
        message_text = f"Your {descriptor} is ready!\n\n(No URL available)"

    try:
        post_to_teams(teams_webhook_url, message_text)
        logger.info("Posted to Teams successfully.")
    except requests.HTTPError as http_err:
        logger.exception("Failed to post to Teams (HTTP error): %s", http_err)
        return {"error": str(http_err)}
    except requests.RequestException as req_exc:
        logger.exception("Failed to post to Teams (Request error): %s", req_exc)
        return {"error": str(req_exc)}

    return {
        "status":       "message_posted",
        "accountName":  account_name,
        "mediaKey":     media_key,
        "mediaUrl":     presigned_url,
        "postType":     post_type,
    }