import os
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client("s3")

def lambda_handler(event, context):
    bucket = os.environ.get("TARGET_BUCKET")
    key    = "artifacts/Logo.png"

    if not bucket:
        raise ValueError("TARGET_BUCKET environment variable not set.")

    try:
        s3.delete_object(Bucket=bucket, Key=key)
        logger.info(f"Deleted s3://{bucket}/{key}")
    except Exception as e:
        logger.error(f"Failed to delete {key} in {bucket}: {e}")
        raise

    return {
      "status": "deleted",
      "deletedBucket": bucket,
      "deletedKey": key
    }