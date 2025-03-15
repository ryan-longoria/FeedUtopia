import datetime
import json
import os
import uuid

import boto3
import logging
import requests
from datetime import timezone

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def lambda_handler(event, context):
    bucket = os.environ.get("TARGET_BUCKET")
    if not bucket:
        error_msg = "TARGET_BUCKET environment variable not set."
        logger.error(error_msg)
        return {"error": error_msg}

    teams_webhook_url = os.environ.get("TEAMS_WEBHOOK_URL")
    if not teams_webhook_url:
        error_msg = "TEAMS_WEBHOOK_URL environment variable not set."
        logger.error(error_msg)
        return {"error": error_msg}

    s3 = boto3.client("s3")
    timestamp = datetime.datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    unique_id = uuid.uuid4().hex

    video_keys = event.get("video_keys", {})
    if not video_keys:
        error_msg = "No video keys found in event."
        logger.error(error_msg)
        return {"error": error_msg}

    complete_key = video_keys.get("complete")
    if not complete_key:
        error_msg = "No 'complete' video key found in event."
        logger.error(error_msg)
        return {"error": error_msg}

    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": complete_key},
            ExpiresIn=604800  # 7 days
        )
    except Exception as e:
        logger.exception("Error generating presigned URL for complete video: %s", e)
        url = None

    message_text = (
        "Your new post has been processed!\n\n"
        "**Complete Post:** Contains background image, gradient, title & subtitle, "
        "news clip, and logo.\n\n"
        f"[View Video]({url})\n\n"
    )

    teams_payload = {"text": message_text}
    try:
        response = requests.post(
            teams_webhook_url,
            headers={"Content-Type": "application/json"},
            data=json.dumps(teams_payload)
        )
        response.raise_for_status()
    except Exception as e:
        logger.exception("Error posting message to Microsoft Teams: %s", e)
        return {"error": "Failed to post to Microsoft Teams channel."}

    logger.info("Message posted to Microsoft Teams successfully.")
    return {
        "status": "message_posted",
        "video_key": complete_key,
        "video_url": url,
    }
