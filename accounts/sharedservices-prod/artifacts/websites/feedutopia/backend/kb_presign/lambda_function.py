import os
import json
import uuid
import traceback
import boto3
import datetime as dt

s3 = boto3.client("s3")

def lambda_handler(event, _ctx):
    try:
        bucket = os.environ["BUCKET"]
        body   = json.loads(event.get("body") or "{}")
        title  = body.get("title", "untitled")
        key    = f"kb/{uuid.uuid4()}.json"

        url = s3.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket":      bucket,
                "Key":         key,
                "ContentType": "application/json",
                "Metadata": {"title": title}
            },
            ExpiresIn=60
        )

        payload = {
            "uploadUrl": url,
            "key":       key,
            "created":   dt.datetime.utcnow().isoformat(),
            "title":     title
        }

        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin":  "*",
                "Access-Control-Allow-Methods": "POST,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            "body": json.dumps(payload)
        }

    except Exception as e:
        # Log the error to CloudWatch
        print("ERROR in kb_presign:", e)
        print(traceback.format_exc())

        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin":  "*",
                "Access-Control-Allow-Methods": "POST,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            "body": json.dumps({"message": "Internal server error"})
        }
