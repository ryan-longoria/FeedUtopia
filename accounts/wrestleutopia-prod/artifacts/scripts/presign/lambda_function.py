import os
import json
import re
import uuid
import logging
from typing import Any, Dict, Optional, Tuple
import boto3

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
PRESIGN_TTL_SECONDS = int(os.getenv("PRESIGN_TTL_SECONDS", "120"))
BUCKET = os.environ["MEDIA_BUCKET"]

ALLOWED_IMAGE_EXT = {"jpg", "jpeg", "png", "webp"}
ALLOWED_VIDEO_EXT = {"mp4", "mov", "webm", "mkv"}

logging.getLogger().setLevel(LOG_LEVEL)
log = logging.getLogger(__name__)

s3 = boto3.client("s3")


def _resp(status: int, body: Any) -> Dict[str, Any]:
    """Return an API Gateway JSON response with strict CORS."""
    return {
        "statusCode": status,
        "headers": {
            "content-type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "authorization,content-type,content-md5",
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        },
        "body": json.dumps(body),
    }


def _safe_base(name: Optional[str]) -> str:
    """Return a safe basename of the provided filename."""
    n = re.sub(r"[^A-Za-z0-9._-]", "_", name or "")
    return n.split("/")[-1].split("\\")[-1][:120]


def _ext_from_ctype(ctype: str) -> Optional[str]:
    """Map MIME type to a simple extension."""
    if not ctype or "/" not in ctype:
        return None
    ext = ctype.split("/", 1)[1].lower()
    return "jpg" if ext == "jpeg" else ext


def _require_md5(headers: Dict[str, str]) -> str:
    """Require Content-MD5 header for integrity on presigned PUT."""
    md5 = (headers.get("content-md5") or headers.get("Content-MD5") or "").strip()
    if not md5:
        raise ValueError("Content-MD5 header required")
    return md5


def _claims_from_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Extract JWT claims from the API Gateway event."""
    jwt = ((event.get("requestContext") or {}).get("authorizer") or {}).get("jwt", {})
    return jwt.get("claims", {}) if isinstance(jwt, dict) else {}


def _role_from_claims(claims: Dict[str, Any]) -> Optional[str]:
    """Map app role from claims to 'wrestlers' or 'promoters'."""
    actor = (claims.get("custom:actor") or "").strip().lower()
    if actor in ("wrestler", "promoter"):
        return "wrestlers" if actor == "wrestler" else "promoters"

    groups = claims.get("cognito:groups") or []
    if isinstance(groups, str):
        groups = [groups]
    gl = {g.lower() for g in groups}
    if "wrestlers" in gl:
        return "wrestlers"
    if "promoters" in gl:
        return "promoters"
    return None


def _parse_request(event: Dict[str, Any]) -> Tuple[str, str, Dict[str, Any], Dict[str, Any]]:
    """Return method, path, querystring, body as parsed values."""
    http = (event.get("requestContext") or {}).get("http") or {}
    method = http.get("method", "GET")
    path = http.get("path", "")
    qs = event.get("queryStringParameters") or {}

    body = {}
    if event.get("body"):
        try:
            body = json.loads(event["body"])
        except Exception:
            body = {}

    return method, path, qs, body


def _validate_type_and_ext(req_type: str, ctype: str) -> str:
    """Validate type vs MIME and return normalized extension."""
    ext = _ext_from_ctype(ctype)
    if req_type in {"logo", "avatar", "image", "gallery"}:
        if not ctype.startswith("image/"):
            raise ValueError("Only image/* allowed for this request type")
        if not ext or ext not in ALLOWED_IMAGE_EXT:
            raise ValueError(f"unsupported image type; allowed: {sorted(ALLOWED_IMAGE_EXT)}")
    elif req_type in {"video", "highlight"}:
        if not ctype.startswith("video/"):
            raise ValueError("Only video/* allowed for this request type")
        if not ext or ext not in ALLOWED_VIDEO_EXT:
            raise ValueError(f"unsupported video type; allowed: {sorted(ALLOWED_VIDEO_EXT)}")
    else:
        ext = ext or "bin"
    return "jpg" if ext == "jpeg" else ext


def _object_key_for_path(
    path: str,
    sub: str,
    req_type: str,
    role_claim: Optional[str],
    qs_actor: Optional[str],
    filename: str,
    ext: str
) -> str:
    """Produce the S3 object key according to your current routes."""

    if path.endswith("/profiles/wrestlers/me/photo-url"):
        return f"public/wrestlers/profiles/{sub}/avatar.{ext}"

    if path.endswith("/profiles/promoters/me/logo-url"):
        return f"public/promoters/profiles/{sub}/logo.{ext}"

    final_role = role_claim or (
        "wrestlers" if (qs_actor or "").lower() == "wrestler"
        else "promoters" if (qs_actor or "").lower() == "promoter"
        else None
    )

    if req_type == "logo":
        if final_role == "promoters":
            return f"public/promoters/profiles/{sub}/logo.{ext}"
        if final_role == "wrestlers":
            return f"public/wrestlers/profiles/{sub}/avatar.{ext}"
        return f"raw/uploads/{sub}/{filename}"

    if req_type in {"gallery", "image"}:
        return (
            f"public/{final_role}/gallery/{sub}/{filename}"
            if final_role else f"raw/uploads/{sub}/{filename}"
        )

    if req_type in {"highlight", "video"}:
        return (
            f"public/{final_role}/highlights/{sub}/{filename}"
            if final_role else f"raw/uploads/{sub}/{filename}"
        )

    return f"raw/uploads/{sub}/{filename}"


def lambda_handler(event, _ctx):
    """Authorize, validate inputs, and return a presigned PUT URL (AES256)."""
    method, path, qs, body = _parse_request(event)

    if method == "OPTIONS":
        return _resp(204, "")

    claims = _claims_from_event(event)
    sub = (claims.get("sub") or "").strip()
    if not sub:
        return _resp(401, {"message": "Unauthorized"})

    ctype = (body.get("contentType") or qs.get("contentType") or "").strip().lower()
    if not ctype:
        return _resp(400, {"message": "contentType is required"})

    req_type = (qs.get("type") or "").strip().lower()
    raw_name = _safe_base(qs.get("key") or body.get("key") or "")
    role_claim = _role_from_claims(claims)
    qs_actor = (qs.get("actor") or "").strip().lower()

    try:
        ext = _validate_type_and_ext(req_type, ctype)
    except ValueError as e:
        return _resp(400, {"message": str(e)})

    if not raw_name:
        raw_name = f"{uuid.uuid4().hex}.{ext}"

    try:
        content_md5 = _require_md5(event.get("headers") or {})
    except ValueError as e:
        return _resp(400, {"message": str(e)})

    object_key = _object_key_for_path(
        path=path,
        sub=sub,
        req_type=req_type,
        role_claim=role_claim,
        qs_actor=qs_actor,
        filename=raw_name,
        ext=ext,
    )

    params = {
        "Bucket": BUCKET,
        "Key": object_key,
        "ContentType": ctype,
        "ServerSideEncryption": "AES256",
        "ContentMD5": content_md5,
    }

    url = s3.generate_presigned_url(
        ClientMethod="put_object",
        Params=params,
        ExpiresIn=PRESIGN_TTL_SECONDS,
    )

    log.info(
        {
            "msg": "issued_presign",
            "sub": sub,
            "type": req_type,
            "key": object_key,
            "ttl": PRESIGN_TTL_SECONDS,
            "ctype": ctype,
            "role_claim": role_claim,
            "path": path,
        }
    )

    return _resp(
        200,
        {
            "uploadUrl": url,
            "objectKey": object_key,
            "expiresIn": PRESIGN_TTL_SECONDS,
            "contentType": ctype,
            "sse": "AES256",
        },
    )
