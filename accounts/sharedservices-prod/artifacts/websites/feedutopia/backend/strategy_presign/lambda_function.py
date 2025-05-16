import os, json, boto3, time, urllib.parse

s3     = boto3.client("s3")
BUCKET = os.environ["BUCKET"]

def lambda_handler(event, _):
    body = json.loads(event["body"])
    key  = urllib.parse.quote(body["key"], safe="/")

    url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": BUCKET, "Key": key, "ContentType": "application/json"},
        ExpiresIn=900
    )

    return {
        "statusCode": 200,
        "headers": {"Access-Control-Allow-Origin":"*"},
        "body": json.dumps({"uploadUrl": url})
    }
