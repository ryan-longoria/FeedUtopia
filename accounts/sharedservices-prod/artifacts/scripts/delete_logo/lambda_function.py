import logging
import os
from typing import Any, Dict

import boto3
from botocore.exceptions import ClientError

LOGGER = logging.getLogger(__name__)
LOGGER.setLevel(logging.INFO)

S3_CLIENT = boto3.client("s3")


def delete_s3_object(bucket: str, key: str) -> None:
    """
    Delete an object from the specified S3 bucket.

    Args:
        bucket (str): The name of the S3 bucket.
        key (str): The key of the object to delete.

    Raises:
        ClientError: If the S3 client encounters an error during deletion.
    """
    try:
        response = S3_CLIENT.delete_object(Bucket=bucket, Key=key)
        status_code = response['ResponseMetadata']['HTTPStatusCode']
        if status_code != 204:
            LOGGER.warning(
                "Unexpected status code %d received when deleting S3 object: s3://%s/%s",
                status_code,
                bucket,
                key
            )
    except ClientError as err:
        LOGGER.error("Failed to delete s3://%s/%s: %s", bucket, key, err)
        raise


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, str]:
    """
    AWS Lambda function that deletes a specific object from an S3 bucket.

    This function retrieves the bucket name from the 'TARGET_BUCKET'
    environment variable and deletes the 'artifacts/Logo.png' object.

    Args:
        event (dict): The event data provided to the Lambda function.
        context: The AWS Lambda context object (unused).

    Returns:
        dict: A dictionary containing the status, bucket, and key of the deleted object.

    Raises:
        ValueError: If the 'TARGET_BUCKET' environment variable is not set.
        ClientError: If deleting the S3 object fails.
    """
    bucket = os.environ.get("TARGET_BUCKET")
    key = "artifacts/Logo.png"

    if not bucket:
        raise ValueError("TARGET_BUCKET environment variable is not set.")

    delete_s3_object(bucket, key)
    LOGGER.info("Deleted s3://%s/%s", bucket, key)

    return {
        "status": "deleted",
        "deletedBucket": bucket,
        "deletedKey": key
    }
