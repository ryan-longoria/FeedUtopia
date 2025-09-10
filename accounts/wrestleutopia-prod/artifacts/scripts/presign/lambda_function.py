import os, json, boto3, urllib.parse, re

s3   = boto3.client("s3")
BUCK = os.environ["MEDIA_BUCKET"]

def _resp(status, body):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body)
    }

def lambda_handler(event, _ctx):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")

    if method == "OPTIONS":
        return {"statusCode": 204, "headers": {"content-type":"application/json"}, "body": ""}

    claims = (event.get("requestContext",{}).get("authorizer",{}).get("jwt",{}) or {}).get("claims",{})
    sub = claims.get("sub")
    if not sub:
        return _resp(401, {"message": "Unauthorized"})

    qs    = event.get("queryStringParameters") or {}
    raw   = (qs.get("key") or "").strip()
    ctype = (qs.get("contentType") or "application/octet-stream").strip()

    base = raw.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    safe_base = re.sub(r"[^A-Za-z0-9._-]", "_", base)[:120]
    if not safe_base:
        return _resp(400, {"message": "key (filename) required"})

    object_key = f"user/{sub}/{safe_base}"

    expires = 300
    url = s3.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": BUCK,
            "Key": object_key,
            "ContentType": ctype,
        },
        ExpiresIn=expires,
    )

    return _resp(200, {"uploadUrl": url, "objectKey": object_key, "expiresIn": expires})
