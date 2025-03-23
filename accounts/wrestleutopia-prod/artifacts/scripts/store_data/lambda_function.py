import json
import logging
import os
from typing import Any, Dict

import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

BUCKET_NAME = os.environ.get("BUCKET_NAME", "OUTPUT_BUCKET")
s3 = boto3.client("s3")


def store_data_in_s3(data: Dict, bucket_name: str, key: str) -> None:
    """
    Uploads the given data as JSON to the specified S3 bucket under the given key.

    Args:
        data (dict): The data to be serialized and stored.
        bucket_name (str): Name of the S3 bucket.
        key (str): The S3 object key where the data will be stored.

    Raises:
        Exception: If the S3 upload fails for any reason.
    """
    json_data = json.dumps(data, indent=4)
    s3.put_object(Bucket=bucket_name, Key=key, Body=json_data)


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler that processes input events, extracts the `post` content,
    and uploads it to an S3 bucket as JSON.

    Args:
        event (dict): The input event, typically from AWS Lambda. The `post` key
            or `processedContent.post` key is expected to contain the data.
        context (object): The Lambda Context runtime methods and attributes.

    Returns:
        dict: A dictionary containing the status of the operation. If successful,
            includes the S3 key used for storage. Otherwise, returns an error
            message.
    """
    post_data = event.get("post") or event.get("processedContent", {}).get("post")
    if not post_data:
        error_msg = "No 'post' data found in the event."
        logger.error(error_msg)
        return {"status": "error", "error": error_msg}

    s3_key = "most_recent_post.json"
    try:
        store_data_in_s3(post_data, BUCKET_NAME, s3_key)
        logger.info(
            "Post data stored in S3 bucket '%s' with key '%s'.",
            BUCKET_NAME, 
            s3_key
        )
        return {"status": "stored", "s3_key": s3_key}
    except Exception as err:
        logger.exception("Failed to store post data in S3: %s", err)
        return {"status": "error", "error": str(err)}
