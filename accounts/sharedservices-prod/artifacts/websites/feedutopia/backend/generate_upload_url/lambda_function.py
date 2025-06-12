import json
import os
import uuid
import re
import boto3

s3 = boto3.client("s3")
BUCKET = os.environ["UPLOAD_BUCKET"]

def lambda_handler(event, _ctx):
    body = json.loads(event.get("body", "{}"))

    if "mediaType" in body:
        media_type = body["mediaType"]
        if media_type not in ("photo", "video"):
            return _resp(400, "mediaType must be photo|video")
        ext = "png" if media_type == "photo" else "mp4"
        key_name = f"{uuid.uuid4()}/media.{ext}"

    elif "filename" in body and "purpose" in body:
        original = body["filename"]
        safe = re.sub(r"\s+", "_", original)
        key_name = f"refs/{uuid.uuid4()}_{safe}"

    else:
        return _resp(400, "must provide mediaType or filename+purpose")

    presigned = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": BUCKET, "Key": key_name},
        ExpiresIn=900,
    )
    return _resp(200, {"url": presigned, "objectKey": key_name})


def _resp(code, body):
    return {
        "statusCode": code,
        "headers": {"Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body),
    }
