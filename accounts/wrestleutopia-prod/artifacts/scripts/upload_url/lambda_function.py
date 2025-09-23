# lambda_function.py (upload-url)
import os, json, uuid, time, boto3
from botocore.config import Config

s3  = boto3.client("s3", config=Config(signature_version="s3v4"))
ddb = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
BUCKET = os.environ["MEDIA_BUCKET"]
CDN    = os.environ.get("CDN_BASE")

def lambda_handler(event, ctx):
    body = json.loads(event.get("body") or "{}")
    profile_type = body["profileType"]   # wrestler|promoter
    profile_id   = body["profileId"]
    file_name    = body["filename"]
    content_type = body["contentType"]
    media_type   = "image" if content_type.startswith("image/") else "video"

    media_id = str(uuid.uuid4())
    key = f"raw/{media_id}/{file_name}"

    pk = f"{profile_type.upper()}#{profile_id}"
    sk = f"MEDIA#{media_id}"

    # seed item
    ddb.put_item(Item={
        "PK": pk, "SK": sk, "entity": "MEDIA", "type": media_type, "status": "pending",
        "original": {"bucket": BUCKET, "key": key, "contentType": content_type},
        "createdAt": int(time.time()*1000)
    })

    # Presign with required metadata; FE must send the same headers on PUT
    # Note: For metadata to be enforced, prefer presigned POST with conditions.
    url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": BUCKET,
            "Key": key,
            "ContentType": content_type,
            "Metadata": { "pk": pk, "sk": sk }
        },
        ExpiresIn=900
    )

    return {
        "statusCode": 200,
        "headers": {
            "access-control-allow-origin": os.environ["ALLOWED_ORIGIN"],
            "access-control-allow-credentials": "true",
            "vary": "origin",
            "content-type": "application/json"
        },
        "body": json.dumps({ "uploadUrl": url, "mediaId": media_id })
    }
