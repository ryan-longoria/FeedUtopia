import json, os, uuid, boto3
s3 = boto3.client("s3")

BUCKET = os.environ["UPLOAD_BUCKET"]

def lambda_handler(event, _ctx):
    body = json.loads(event.get("body", "{}"))
    media_type = body.get("mediaType")
    if media_type not in ("photo", "video"):
        return _resp(400, "mediaType must be photo|video")

    key_name = f"{uuid.uuid4()}/" + ("image.png" if media_type=="photo" else "video.mp4")
    presigned = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": BUCKET, "Key": key_name},
        ExpiresIn=900
    )
    return _resp(200, {"url": presigned, "key": key_name})

def _resp(code, body):
    return {
        "statusCode": code,
        "headers": {"Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body)
    }
