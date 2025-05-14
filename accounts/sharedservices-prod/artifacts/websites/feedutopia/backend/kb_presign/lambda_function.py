import os, json, uuid, boto3, datetime as dt
s3 = boto3.client("s3")

def lambda_handler(event, _ctx):
    body   = json.loads(event["body"] or "{}")
    title  = body.get("title", "untitled")
    key    = f"kb/{uuid.uuid4()}.json"

    url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": os.environ["BUCKET"], "Key": key, "ContentType": "application/json"},
        ExpiresIn=60  # 1 min
    )

    return {
        "statusCode": 200,
        "headers": {"Access-Control-Allow-Origin": "*"},
        "body": json.dumps({"uploadUrl": url, "key": key, "created": dt.datetime.utcnow().isoformat(), "title": title})
    }
