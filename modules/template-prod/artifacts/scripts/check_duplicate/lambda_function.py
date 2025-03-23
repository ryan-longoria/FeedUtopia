import logging
import os
from typing import Any, Dict

import boto3
import botocore


LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

NOT_FOUND_ERROR_CODE = "404"

MARKER_PREFIX = "post_markers"

try:
    BUCKET_NAME = os.environ["IDEMPOTENCY_BUCKET"]
except KeyError as exc:
    raise RuntimeError(
        "IDEMPOTENCY_BUCKET environment variable is not set."
    ) from exc

S3_CLIENT = boto3.client("s3")


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda entry point to process an incoming event. It checks for
    the existence of a marker file in S3 for idempotent handling of a post.

    Args:
        event (dict): The event data passed by AWS Lambda. Must contain a
            "post_id" key.
        context (object): The runtime information provided by AWS Lambda.

    Returns:
        dict: A dictionary containing status information:
            - If 'post_id' is missing, returns {"status": "error",
              "message": "..."}.
            - If the marker exists, returns {"status": "duplicate",
              "post_id": "..."}.
            - If the marker does not exist, creates it and returns
              {"status": "post_found", "post_id": "..."}.
    """
    post_id = event.get("post_id")
    if not post_id:
        LOGGER.warning("No 'post_id' provided in the event.")
        return {"status": "error", "message": "No post_id provided"}

    marker_key = f"{MARKER_PREFIX}/{post_id}.marker"
    LOGGER.info("Checking marker: %s in bucket: %s", marker_key, BUCKET_NAME)

    try:
        S3_CLIENT.head_object(Bucket=BUCKET_NAME, Key=marker_key)
        LOGGER.info("Duplicate post_id=%s. Marker file found.", post_id)
        return {"status": "duplicate", "post_id": post_id}
    except botocore.exceptions.ClientError as error:
        if error.response["Error"]["Code"] == NOT_FOUND_ERROR_CODE:
            LOGGER.info(
                "No marker found for post_id=%s. Creating one now.", post_id
            )
            S3_CLIENT.put_object(
                Bucket=BUCKET_NAME,
                Key=marker_key,
                Body=b""
            )
            return {"status": "post_found", "post_id": post_id}

        LOGGER.error(
            "Unexpected error when checking marker for post_id=%s: %s",
            post_id,
            error
        )
        raise
