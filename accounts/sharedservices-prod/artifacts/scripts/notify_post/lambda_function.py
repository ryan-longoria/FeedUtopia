import json
import os
import uuid
import logging
import requests
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")

def lambda_handler(event, context):
    teams_map_str = os.environ.get("TEAMS_WEBHOOKS_JSON")
    if not teams_map_str:
        msg = "TEAMS_WEBHOOKS_JSON not found in environment"
        logger.error(msg)
        return {"error": msg}

    teams_map = json.loads(teams_map_str)

    account_name = event.get("accountName")
    if not account_name:
        msg = "No accountName found in event input"
        logger.error(msg)
        return {"error": msg}

    try:
        teams_webhook_url = teams_map[account_name]["manual"]
    except KeyError:
        msg = f"accountName '{account_name}' not in teams_map, or missing 'manual'"
        logger.error(msg)
        return {"error": msg}

    video_keys = event.get("videoResult", {}).get("video_key")
    if not video_keys:
        logger.warning("No video_key in event. Using fallback message.")
        video_keys = "No final video key?"

    bucket = os.environ.get("TARGET_BUCKET")
    url = None
    if bucket and isinstance(video_keys, str):
        try:
            url = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": video_keys},
                ExpiresIn=604800
            )
        except Exception as e:
            logger.exception("Error generating presigned URL: %s", e)
            url = None

    if url:
        message_text = f"Your new post is ready!\n\n[View Video]({url})"
    else:
        message_text = "Your new post is ready!\n\n(No URL available)"

    payload = {"text": message_text}
    try:
        resp = requests.post(
            teams_webhook_url,
            headers={"Content-Type": "application/json"},
            data=json.dumps(payload)
        )
        resp.raise_for_status()
        logger.info("Posted to Teams successfully.")
    except Exception as e:
        logger.exception("Failed to post to Teams: %s", e)
        return {"error": str(e)}

    return {
        "status": "message_posted",
        "accountName": account_name,
        "videoKey": video_keys,
        "videoUrl": url
    }
