import os
import json
import uuid
import boto3
import datetime as dt
import traceback

s3 = boto3.client("s3")

def lambda_handler(event, _ctx):
    try:
        bucket   = os.environ["BUCKET"]
        body     = json.loads(event.get("body") or "{}")
        title    = body.get("title", "untitled")
        category = body.get("category", "")

        key = body.get("key") or f"kb/{uuid.uuid4()}.json"

        metadata = {"title": title}
        if category:
            metadata["category"] = category

        url = s3.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket":      bucket,
                "Key":         key,
                "ContentType": "application/json",
                "Metadata":    metadata
            },
            ExpiresIn=300   # 5 minutes
        )

        created = body.get("created") or dt.datetime.utcnow().isoformat()

        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin":  "*",
                "Access-Control-Allow-Methods": "POST,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            "body": json.dumps({
                "uploadUrl": url,
                "key":       key,
                "created":   created,
                "title":     title,
                "category":  category
            })
        }

    except Exception:
        traceback.print_exc()
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin":  "*",
                "Access-Control-Allow-Methods": "POST,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            "body": json.dumps({"message": "Internal server error"})
        }
