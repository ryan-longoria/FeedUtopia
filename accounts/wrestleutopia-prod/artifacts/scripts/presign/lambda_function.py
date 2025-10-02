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
        "headers": {
            "content-type": "application/json",
            # If you terminate CORS in API Gateway you can omit these, but they don't hurt:
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "authorization,content-type",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
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

def _role_from_actor(actor: str | None) -> str | None:
    a = (actor or "").strip().lower()
    if a == "wrestler":
        return "wrestlers"
    if a == "promoter":
        return "promoters"
    return None


def lambda_handler(event, _ctx):
    http = event.get("requestContext", {}).get("http", {}) or {}
    method = http.get("method", "GET")
    path   = http.get("path", "")

    if method == "OPTIONS":
        return _resp(204, "")

    claims = (event.get("requestContext",{})
                    .get("authorizer",{})
                    .get("jwt",{}) or {}).get("claims",{})
    sub = claims.get("sub")
    if not sub:
        return _resp(401, {"message": "Unauthorized"})

    qs    = event.get("queryStringParameters") or {}
    body  = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            body = {}

    # 🔧 prefer body.contentType if provided, else query
    ctype = (body.get("contentType") or qs.get("contentType") or "application/octet-stream").strip()
    raw   = (qs.get("key") or "").strip()

    # --- Dedicated avatar presign (wrestler) ---
    if path.endswith("/profiles/wrestlers/me/photo-url"):
        if not ctype.startswith("image/"):
            return _resp(400, {"message": "contentType must be image/* for avatar uploads"})
        ext = _ext_from_ctype(ctype)
        if not ext or ext not in ALLOWED_IMAGE_EXT:
            return _resp(400, {"message": f"unsupported image type; allowed: {sorted(ALLOWED_IMAGE_EXT)}"})
        object_key = f"public/wrestlers/profiles/{sub}/avatar.{ 'jpg' if ext == 'jpeg' else ext }"

    # 🔧 make this an elif so we don't fall through into the generic else
    elif path.endswith('/profiles/promoters/me/logo-url'):
        if not ctype.startswith('image/'):
            return _resp(400, {'message':'contentType must be image/* for logo uploads'})
        ext = _ext_from_ctype(ctype)
        if not ext or ext not in ALLOWED_IMAGE_EXT:
            return _resp(400, {'message': f'unsupported image type; allowed: {sorted(ALLOWED_IMAGE_EXT)}'})
        object_key = f"public/promoters/profiles/{sub}/logo.{ 'jpg' if ext == 'jpeg' else ext }"

    # --- Generic presign (/s3/presign) ---
    else:
        req_type = (qs.get("type") or "").strip().lower()      # 'logo' | 'gallery' | 'highlight' | 'video'
        actor    = (qs.get("actor") or "").strip().lower()     # 'wrestler' | 'promoter'
        role     = _role_from_actor(actor)

        base = _safe_base((raw.rsplit("/",1)[-1]).rsplit("\\",1)[-1])

        if req_type == "logo":
            if not ctype.startswith("image/"):
                return _resp(400, {"message": "contentType must be image/* for logo uploads"})
            ext = _ext_from_ctype(ctype)
            if not ext or ext not in ALLOWED_IMAGE_EXT:
                return _resp(400, {"message": f"unsupported image type; allowed: {sorted(ALLOWED_IMAGE_EXT)}"})
            ext = "jpg" if ext == "jpeg" else ext

            if role == "promoters":
                object_key = f"public/promoters/profiles/{sub}/logo.{ext}"
            elif role == "wrestlers":
                object_key = f"public/wrestlers/profiles/{sub}/avatar.{ext}"
            else:
                if not base:
                    return _resp(400, {"message": "key (filename) required"})
                object_key = f"raw/uploads/{sub}/{base}"

        elif req_type in ("gallery", "image"):
            if not base:
                return _resp(400, {"message": "key (filename) required"})
            object_key = f"public/{role}/gallery/{sub}/{base}" if role else f"raw/uploads/{sub}/{base}"

        elif req_type in ("highlight", "video"):
            if not base:
                return _resp(400, {"message": "key (filename) required"})
            object_key = f"public/{role}/highlights/{sub}/{base}" if role else f"raw/uploads/{sub}/{base}"

        else:
            if not base:
                return _resp(400, {"message": "key (filename) required"})
            object_key = f"raw/uploads/{sub}/{base}"

    # Sign PUT (same as yours)
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