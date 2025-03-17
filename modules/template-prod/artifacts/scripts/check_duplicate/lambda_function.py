import boto3
import botocore
import os
import logging

s3 = boto3.client("s3")
logger = logging.getLogger()
logger.setLevel(logging.INFO)

BUCKET_NAME = os.environ["IDEMPOTENCY_BUCKET"]

def lambda_handler(event, context):
    post_id = event.get("post_id")
    if not post_id:
        return {"status": "error", "message": "No post_id provided"}

    marker_key = f"post_markers/{post_id}.marker"

    try:
        s3.head_object(Bucket=BUCKET_NAME, Key=marker_key)
        logger.info(f"Duplicate post_id={post_id}. Marker file found.")
        return {"status": "duplicate", "post_id": post_id}
    except botocore.exceptions.ClientError as e:
        if e.response["Error"]["Code"] == "404":
            logger.info(f"No marker found for {post_id}. Creating one now.")
            s3.put_object(Bucket=BUCKET_NAME, Key=marker_key, Body=b"")
            return {"status": "post_found", "post_id": post_id}
        else:
            raise
