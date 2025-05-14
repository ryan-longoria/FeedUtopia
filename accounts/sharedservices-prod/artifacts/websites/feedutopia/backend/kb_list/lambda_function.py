import os
import json
import traceback
import boto3

s3 = boto3.client("s3")

def lambda_handler(event, _ctx):
    try:
        bucket = os.environ["BUCKET"]
        objs = s3.list_objects_v2(Bucket=bucket, Prefix="kb/")
        items = []
        for o in objs.get("Contents", []):
            meta = s3.head_object(Bucket=bucket, Key=o["Key"])
            items.append({
                "key":     o["Key"],
                "title":   meta["Metadata"].get("title", "untitled"),
                "created": meta["LastModified"].isoformat()
            })

        body = json.dumps(sorted(items, key=lambda i: i["created"], reverse=True))
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin":  "*",
                "Access-Control-Allow-Methods": "GET,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            "body": body
        }

    except Exception as e:
        print("ERROR in kb_list:", e)
        print(traceback.format_exc())

        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin":  "*",
                "Access-Control-Allow-Methods": "GET,OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type"
            },
            "body": json.dumps({"message": "Internal server error"})
        }
