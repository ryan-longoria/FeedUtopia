import os, json, boto3, re

s3   = boto3.client("s3")
BUCK = os.environ["MEDIA_BUCKET"]

ALLOWED_IMAGE_EXT = {"jpg", "jpeg", "png", "webp"}

def _resp(status, body):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body)
    }

def _safe_base(name: str) -> str:
    # keep letters, digits, dot, underscore, hyphen
    return re.sub(r"[^A-Za-z0-9._-]", "_", name)[:120]

def lambda_handler(event, _ctx):
    http = event.get("requestContext", {}).get("http", {}) or {}
    method = http.get("method", "GET")
    path   = http.get("path", "")

    if method == "OPTIONS":
        return {"statusCode": 204, "headers": {"content-type": "application/json"}, "body": ""}

    claims = (event.get("requestContext",{}).get("authorizer",{}).get("jwt",{}) or {}).get("claims",{})
    sub = claims.get("sub")
    if not sub:
        return _resp(401, {"message": "Unauthorized"})

    qs    = event.get("queryStringParameters") or {}
    raw   = (qs.get("key") or "").strip()
    ctype = (qs.get("contentType") or "application/octet-stream").strip()

    # Decide target key
    if path.endswith("/profiles/wrestlers/me/photo-url"):
        # Require an image content-type and standardize key to profiles/{sub}/avatar.ext
        if not ctype.startswith("image/"):
            return _resp(400, {"message": "contentType must be image/* for avatar uploads"})
        ext = ctype.split("/", 1)[1].lower()
        if ext == "jpeg": ext = "jpg"
        if ext not in ALLOWED_IMAGE_EXT:
            return _resp(400, {"message": f"unsupported image type; allowed: {sorted(ALLOWED_IMAGE_EXT)}"})
        object_key = f"profiles/{sub}/avatar.{ext}"
    else:
        # Generic per-user upload under user/{sub}/
        base = raw.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
        base = _safe_base(base)
        if not base:
            return _resp(400, {"message": "key (filename) required"})
        object_key = f"user/{sub}/{base}"

    expires = 300
    url = s3.generate_presigned_url(
        ClientMethod="put_object",
        Params={
            "Bucket": BUCK,
            "Key": object_key,
            "ContentType": ctype,
            "ServerSideEncryption": "AES256",
        },
        ExpiresIn=expires,
    )

    return _resp(200, {"uploadUrl": url, "objectKey": object_key, "expiresIn": expires})
