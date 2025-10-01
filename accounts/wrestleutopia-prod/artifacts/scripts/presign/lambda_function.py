import os
import json
import re
import boto3

s3   = boto3.client("s3")
BUCK = os.environ["MEDIA_BUCKET"]

ALLOWED_IMAGE_EXT = {"jpg", "jpeg", "png", "webp"}

def _resp(status, body):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body),
    }

def _safe_base(name: str) -> str:
    # keep letters, digits, dot, underscore, hyphen
    return re.sub(r"[^A-Za-z0-9._-]", "_", name)[:120]

def _ext_from_ctype(ctype: str) -> str | None:
    if not ctype or "/" not in ctype:
        return None
    ext = ctype.split("/", 1)[1].lower()
    return "jpg" if ext == "jpeg" else ext

def lambda_handler(event, _ctx):
    http = event.get("requestContext", {}).get("http", {}) or {}
    method = http.get("method", "GET")
    path   = http.get("path", "")

    # CORS preflight handled by API GW; still return cleanly
    if method == "OPTIONS":
        return {"statusCode": 204, "headers": {"content-type": "application/json"}, "body": ""}

    claims = (event.get("requestContext",{})
                    .get("authorizer",{})
                    .get("jwt",{}) or {}).get("claims",{})
    sub = claims.get("sub")
    if not sub:
        return _resp(401, {"message": "Unauthorized"})

    qs    = event.get("queryStringParameters") or {}
    raw   = (qs.get("key") or "").strip()
    ctype = (qs.get("contentType") or "application/octet-stream").strip()

    if path.endswith("/profiles/wrestlers/me/photo-url"):
        if not ctype.startswith("image/"):
            return _resp(400, {"message": "contentType must be image/* for avatar uploads"})
        ext = _ext_from_ctype(ctype)
        if not ext or ext not in ALLOWED_IMAGE_EXT:
            return _resp(400, {"message": f"unsupported image type; allowed: {sorted(ALLOWED_IMAGE_EXT)}"})
        object_key = f"public/wrestlers/profiles/{sub}/avatar.{ 'jpg' if ext == 'jpeg' else ext }"


    else:
        req_type = (qs.get("type") or "").strip().lower()      # 'logo' to request logo path
        actor    = (qs.get("actor") or "").strip().lower()     # 'wrestler' | 'promoter'
        base     = raw.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
        base     = _safe_base(base)

        if req_type == "logo":
            # Validate as image
            if not ctype.startswith("image/"):
                return _resp(400, {"message": "contentType must be image/* for logo uploads"})
            ext = _ext_from_ctype(ctype)
            if not ext or ext not in ALLOWED_IMAGE_EXT:
                return _resp(400, {"message": f"unsupported image type; allowed: {sorted(ALLOWED_IMAGE_EXT)}"})

            if actor == "promoter":
                object_key = f"public/promoters/profiles/{sub}/logo.{ 'jpg' if ext == 'jpeg' else ext }"
            else:
                # Default to wrestler logo/avatar if actor unspecified or 'wrestler'
                object_key = f"public/wrestlers/profiles/{sub}/avatar.{ 'jpg' if ext == 'jpeg' else ext }"

        else:
            # Raw ingest (processor will produce public variants later)
            if not base:
                return _resp(400, {"message": "key (filename) required"})
            object_key = f"raw/uploads/{sub}/{base}"

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

    return _resp(200, {
        "uploadUrl": url,
        "objectKey": object_key,
        "expiresIn": expires,
        "contentType": ctype
    })
