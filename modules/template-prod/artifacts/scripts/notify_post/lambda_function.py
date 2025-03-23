import datetime
import json
import logging
import os
import uuid
from datetime import timezone
from typing import Any, Dict

import boto3
import requests

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def get_env_var(name: str) -> str:
    """
    Retrieve a required environment variable.
    Raises a ValueError if the variable is not set.

    Args:
        name (str): The name of the environment variable.

    Returns:
        str: The value of the requested environment variable.

    Raises:
        ValueError: If the environment variable is not set.
    """
    value = os.environ.get(name)
    if not value:
        error_msg = f"{name} environment variable not set."
        logger.error(error_msg)
        raise ValueError(error_msg)
    return value


def get_video_key(event: Dict[str, Any]) -> str:
    """
    Extract the 'complete' video key from the event.
    If the event has 'video_keys', we look for 'complete'.
    Otherwise, we look for 'video_key'.

    Args:
        event (dict): The Lambda event payload.

    Returns:
        str: The 'complete' video key.

    Raises:
        ValueError: If no valid key is found in the event.
    """
    video_keys = event.get("video_keys")
    if video_keys is None:
        single_key = event.get("video_key")
        if single_key:
            video_keys = {"complete": single_key}
        else:
            error_msg = "No video keys found in event."
            logger.error(error_msg)
            raise ValueError(error_msg)

    complete_key = video_keys.get("complete")
    if not complete_key:
        error_msg = "No 'complete' video key found in event."
        logger.error(error_msg)
        raise ValueError(error_msg)

    return complete_key


def generate_presigned_url(
    s3_client: boto3.client,
    bucket: str,
    key: str,
    expiry: int = 604800
) -> str:
    """
    Generate a presigned URL for the specified S3 object.
    By default, the URL expires in 7 days (604800 seconds).

    Args:
        s3_client (boto3.client): A Boto3 S3 client instance.
        bucket (str): The S3 bucket name.
        key (str): The S3 object key.
        expiry (int): The time in seconds for the presigned URL to remain valid.

    Returns:
        str: The generated presigned URL. Returns an empty string if generation fails.
    """
    try:
        url = s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expiry
        )
        return url
    except Exception as e:
        logger.exception("Error generating presigned URL for complete video: %s", e)
        return ""


def post_to_teams(webhook_url: str, message_text: str) -> None:
    """
    Post a message to Microsoft Teams using the given webhook URL.

    Args:
        webhook_url (str): The Teams incoming webhook URL.
        message_text (str): The message content to post.

    Raises:
        HTTPError: If the HTTP POST request fails.
    """
    payload = {"text": message_text}
    response = requests.post(
        webhook_url,
        headers={"Content-Type": "application/json"},
        data=json.dumps(payload),
    )
    response.raise_for_status()


def download_json_from_s3(bucket_name: str, s3_key: str) -> Dict[str, Any]:
    """
    Download a JSON file from S3 and return its contents as a dictionary.

    Args:
        bucket_name (str): The name of the S3 bucket.
        s3_key (str): The key of the JSON file in the S3 bucket.

    Returns:
        dict: The parsed JSON content.
    """
    s3_client = boto3.client("s3")
    logger.info(
        "Downloading JSON from bucket='%s', key='%s' for inclusion in Teams message.",
        bucket_name,
        s3_key
    )
    response = s3_client.get_object(Bucket=bucket_name, Key=s3_key)
    return json.loads(response["Body"].read())


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler function that posts a processed video message to Microsoft Teams.

    It retrieves a presigned URL from S3 for the 'complete' video key,
    downloads the text from most_recent_post.json, constructs a message,
    and sends it to a Microsoft Teams channel via an incoming webhook.

    Args:
        event (dict): The event data containing either a 'video_keys' dict
            or a single 'video_key' under the key 'video_key'.
        context (Any): Contains runtime information about the Lambda function.

    Returns:
        dict: A dictionary containing either a success status and video details,
              or an error message.
    """
    try:
        bucket = get_env_var("TARGET_BUCKET")
        teams_webhook_url = get_env_var("TEAMS_WEBHOOK_URL")

        s3 = boto3.client("s3")
        complete_key = get_video_key(event)
        presigned_url = generate_presigned_url(s3, bucket, complete_key)

        post_data = download_json_from_s3(bucket, "most_recent_post.json")
        title = post_data.get("title", "No Title Found")
        body = post_data.get("body", "")

        message_text = (
            "Your new post has been processed!\n\n"
            f"**Title:** {title}\n\n"
            f"**Body:** {body}\n\n"
            f"[View Video]({presigned_url})\n\n"
        )

        post_to_teams(teams_webhook_url, message_text)

        logger.info("Message posted to Microsoft Teams successfully.")
        return {
            "status": "message_posted",
            "video_key": complete_key,
            "video_url": presigned_url,
        }

    except Exception as ex:
        logger.exception("An error occurred in lambda_handler: %s", ex)
        return {"error": str(ex)}
