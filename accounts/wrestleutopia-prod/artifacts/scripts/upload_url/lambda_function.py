import json
import logging
import os
import re
import time
import uuid
from typing import Any, Dict, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

ENVIRONMENT = os.getenv("ENVIRONMENT", "dev").lower()
LOG_LEVEL = os.getenv(
    "LOG_LEVEL", "DEBUG" if ENVIRONMENT != "prod" else "ERROR"
).upper()

logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO))
LOG = logging.getLogger("upload_url")

if ENVIRONMENT == "prod":
    logging.getLogger("boto3").setLevel(logging.ERROR)
    logging.getLogger("botocore").setLevel(logging.ERROR)
else:
    logging.getLogger("boto3").setLevel(logging.WARNING)
    logging.getLogger("botocore").setLevel(logging.WARNING)

BUCKET = os.environ["MEDIA_BUCKET"]
TABLE_NAME = os.environ["TABLE_NAME"]
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
ALLOWED_CT = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "video/mp4",
}
SAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")

S3 = boto3.client(
    "s3", config=Config(signature_version="s3v4", retries={"max_attempts": 3})
)
DDB = boto3.resource("dynamodb").Table(TABLE_NAME)


def jlog(level: int, msg: str, **fields: Any) -> None:
    """Emit a compact JSON log line without PII."""
    payload = {
        "msg": msg,
        "service": "upload-url",
        "env": ENVIRONMENT,
        **fields,
    }
    LOG.log(
        level,
        json.dumps(payload, separators=(",", ":"), ensure_ascii=False),
    )


def _cors_headers() -> Dict[str, str]:
    """Return standard CORS headers for API responses."""
    return {
        "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "authorization,content-type,content-md5",
        "Vary": "Origin",
        "Content-Type": "application/json",
    }


def _resp(status: int, body: Dict[str, Any]) -> Dict[str, Any]:
    """Compose an API Gateway response with CORS and JSON body."""
    return {
        "statusCode": status,
        "headers": _cors_headers(),
        "body": json.dumps(body),
    }


def _safe_filename(name: str) -> str:
    """Sanitize and limit filename length."""
    base = (name or "").rsplit("/", 1)[-1]
    base = SAFE_NAME_RE.sub("_", base).strip("._") or "file"
    return base[:120]


def _claims(event: Dict[str, Any]) -> Dict[str, Any]:
    """Extract JWT claims from API Gateway authorizer context."""
    rc = event.get("requestContext") or {}
    auth = rc.get("authorizer") or {}

    jwt = auth.get("jwt")
    if isinstance(jwt, dict) and "claims" in jwt:
        return jwt.get("claims") or {}

    return auth.get("claims") or {}


def _actor_id(event: Dict[str, Any]) -> Optional[str]:
    """Resolve an actor identifier from common JWT claim fields."""
    c = _claims(event)
    return (
        c.get("sub")
        or c.get("username")
        or c.get("cognito:username")
        or c.get("email")
    )


def lambda_handler(event: Dict[str, Any], _ctx: Any) -> Dict[str, Any]:
    """Create a presigned S3 PUT URL and record the pending media item."""
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 204, "headers": _cors_headers(), "body": ""}

    rid = str(uuid.uuid4())

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        jlog(logging.ERROR, "bad_json", rid=rid)
        return _resp(400, {"error": "invalid_json", "rid": rid})

    try:
        actor = _actor_id(event)
        profile_type = (body.get("profileType") or "").lower().strip()
        profile_id = (body.get("profileId") or "").strip()
        filename_in = (body.get("filename") or "").strip()
        content_type = (body.get("contentType") or "").lower().strip()
        checksum_b64 = (body.get("checksumSHA256") or "").strip()

        if not actor:
            raise ValueError("unauthenticated")
        if profile_type not in {"wrestler", "promoter"}:
            raise ValueError("invalid_profileType")
        if not profile_id:
            raise ValueError("missing_profileId")
        if not filename_in:
            raise ValueError("missing_filename")
        if content_type not in ALLOWED_CT:
            raise ValueError("disallowed_contentType")

        filename = _safe_filename(filename_in)
        media_id = str(uuid.uuid4())
        key = f"raw/{media_id}/{filename}"

        item = {
            "PK": f"{profile_type.upper()}#{profile_id}",
            "SK": f"MEDIA#{media_id}",
            "entity": "MEDIA",
            "type": "image" if content_type.startswith("image/") else "video",
            "status": "pending",
            "original": {
                "bucket": BUCKET,
                "key": key,
                "contentType": content_type,
            },
            "createdAt": int(time.time() * 1000),
            "uploader": actor,
        }

        DDB.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(PK) "
            "AND attribute_not_exists(SK)",
        )

        params: Dict[str, Any] = {
            "Bucket": BUCKET,
            "Key": key,
            "ContentType": content_type,
            "Metadata": {
                "pk": item["PK"],
                "sk": item["SK"],
                "uploader": actor,
            },
            "ServerSideEncryption": "AES256",
        }
        if checksum_b64:
            params["ChecksumSHA256"] = checksum_b64

        url = S3.generate_presigned_url(
            "put_object", Params=params, ExpiresIn=900
        )

        jlog(
            logging.DEBUG,
            "presign.created",
            rid=rid,
            mediaId=media_id,
            key=key,
            ct=content_type,
        )
        return _resp(200, {"uploadUrl": url, "mediaId": media_id, "rid": rid})

    except ValueError as exc:
        lvl = logging.ERROR if ENVIRONMENT == "prod" else logging.WARNING
        jlog(lvl, "validation.error", rid=rid, error=str(exc))
        return _resp(400, {"error": str(exc), "rid": rid})
    except (ClientError, BotoCoreError) as exc:
        jlog(logging.ERROR, "aws.error", rid=rid, error=str(exc))
        return _resp(502, {"error": "upstream_error", "rid": rid})
    except Exception as exc:
        jlog(logging.ERROR, "unhandled", rid=rid, error=str(exc))
        return _resp(500, {"error": "internal", "rid": rid})
