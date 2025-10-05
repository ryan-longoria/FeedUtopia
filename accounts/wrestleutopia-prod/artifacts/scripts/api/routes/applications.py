from __future__ import annotations

import base64
import json
import logging
import os
import re
from typing import Any, Dict, Iterable, List, Tuple

from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key

from auth import _is_wrestler
from config import get_config
from db.tables import T_APP, T_TRY, T_WREST
from db.wrestlers import batch_get_wrestlers, get_wrestler_pk
from http_utils import _json, _now_iso, _resp, _qs

LOGGER = logging.getLogger("wrestleutopia.routes.applications")

MAX_NOTES_LEN = 2000
REEL_URL_RE = re.compile(r"^https?://[^\s]{3,}$", re.IGNORECASE)
BATCH_GET_LIMIT = 100


def _request_id(event: dict) -> str:
    """Extract an API Gateway/Lambda request id for log correlation."""
    return (
        (event.get("requestContext", {}) or {}).get("requestId")
        or (event.get("headers", {}) or {}).get("x-request-id")
        or "unknown"
    )


def _decode_next_token(token: str | None) -> Dict[str, Any] | None:
    """Decode a nextToken produced by _encode_next_token."""
    if not token:
        return None
    try:
        raw = base64.urlsafe_b64decode(token.encode("utf-8")).decode("utf-8")
        data = json.loads(raw)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def _encode_next_token(key: Dict[str, Any] | None) -> str | None:
    """Encode LastEvaluatedKey as an opaque nextToken."""
    if not key:
        return None
    raw = json.dumps(key, separators=(",", ":"), ensure_ascii=False)
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("utf-8")


def _bounded_page_size(qs: dict, default: int = 100, min_v: int = 1, max_v: int = 200) -> int:
    """Return a safe page size parsed from querystring."""
    val = (qs.get("pageSize") or "").strip()
    if not val:
        return default
    try:
        n = int(val)
    except Exception:
        return default
    return max(min_v, min(max_v, n))


def _clean_notes(s: str | None) -> str:
    """Trim and bound notes length."""
    s = (s or "").strip()
    return s[:MAX_NOTES_LEN]


def _clean_reel_link(s: str | None) -> str:
    """Basic URL sanity; allow empty, otherwise require http(s)."""
    s = (s or "").strip()
    if not s:
        return ""
    return s if REEL_URL_RE.match(s) else ""


def _chunked(seq: Iterable[str], size: int) -> Iterable[List[str]]:
    """Yield fixed-size chunks from an iterable."""
    chunk: List[str] = []
    for x in seq:
        chunk.append(x)
        if len(chunk) >= size:
            yield chunk
            chunk = []
    if chunk:
        yield chunk


def _profile_projection() -> Tuple[set[str], str, Dict[str, str]]:
    """Return allowlisted fields and projection/EAN for GetItem fallback."""
    allowed_fields = {"userId", "handle", "stageName", "name", "city", "region", "photoKey"}
    proj = "userId, handle, stageName, #n, city, #r, photoKey"
    ean = {"#r": "region", "#n": "name"}
    return allowed_fields, proj, ean


def _post_application(sub: str, groups: set[str], event) -> dict[str, Any]:
    """Submit a tryout application; idempotent on duplicate."""
    req_id = _request_id(event)
    if not _is_wrestler(groups):
        return _resp(403, {"message": "Wrestler role required"})
    data = _json(event)
    tryout_id = (data.get("tryoutId") or "").strip()
    if not tryout_id:
        return _resp(400, {"message": "tryoutId required"})
    tr = T_TRY.get_item(Key={"tryoutId": tryout_id}).get("Item")
    if not tr:
        return _resp(404, {"message": "Tryout not found"})
    now = _now_iso()
    notes = _clean_notes(data.get("notes"))
    reel = _clean_reel_link(data.get("reelLink"))
    try:
        T_APP.put_item(
            Item={
                "tryoutId": tryout_id,
                "applicantId": sub,
                "applicantIdGsi": sub,
                "timestamp": now,
                "notes": notes,
                "reelLink": reel,
                "status": "submitted",
            },
            ConditionExpression="attribute_not_exists(tryoutId) AND attribute_not_exists(applicantId)",
        )
        LOGGER.info("application_submitted requestId=%s tryout=%s", req_id, tryout_id)
    except ClientError as exc:
        code = (exc.response or {}).get("Error", {}).get("Code")
        if code == "ConditionalCheckFailedException":
            LOGGER.info("application_duplicate requestId=%s tryout=%s", req_id, tryout_id)
            return _resp(200, {"ok": True, "tryoutId": tryout_id, "note": "already_applied"})
        LOGGER.error(
            "application_put_failed requestId=%s tryout=%s code=%s",
            req_id,
            tryout_id,
            code,
        )
        return _resp(500, {"message": "Server error"})
    return _resp(200, {"ok": True, "tryoutId": tryout_id})


def _get_applications(sub: str, event) -> dict[str, Any]:
    """List applications (promoter-owner view or wrestler self view)."""
    qs = _qs(event)
    cfg = get_config()
    des = cfg.deserializer
    req_id = _request_id(event)
    page_size = _bounded_page_size(qs, default=100, min_v=1, max_v=200)
    start_key = _decode_next_token(qs.get("nextToken"))
    if "tryoutId" in qs:
        tryout_id = (qs["tryoutId"] or "").strip()
        if not tryout_id:
            return _resp(400, {"message": "tryoutId required"})
        tr = T_TRY.get_item(Key={"tryoutId": tryout_id}).get("Item")
        if not tr:
            return _resp(404, {"message": "Tryout not found"})
        if tr.get("ownerId") != sub:
            return _resp(403, {"message": "Not your tryout"})
        kwargs = {
            "KeyConditionExpression": Key("tryoutId").eq(tryout_id),
            "Limit": page_size,
        }
        if start_key:
            kwargs["ExclusiveStartKey"] = start_key

        r = T_APP.query(**kwargs)
        apps = r.get("Items", [])
        next_token = _encode_next_token(r.get("LastEvaluatedKey"))
        if apps:
            ids = sorted({a.get("applicantId") for a in apps if a.get("applicantId")})
            profiles: dict[str, dict] = {}
            allowed_fields, proj, ean = _profile_projection()
            for chunk in _chunked(ids, BATCH_GET_LIMIT):
                try:
                    av_items = batch_get_wrestlers(
                        ids=chunk,
                        allowed_fields=allowed_fields,
                        consistent_read=False,
                    )
                    for av in av_items:
                        p = {k: des.deserialize(v) for k, v in av.items()}
                        p["stageName"] = p.get("stageName") or p.get("name") or None
                        uid = p.get("userId")
                        if uid:
                            profiles[uid] = p
                except Exception as exc:
                    LOGGER.info("batch_get_profiles_failed requestId=%s err=%s", req_id, exc)
            if ids:
                pk = get_wrestler_pk()
                for uid in ids:
                    if uid in profiles:
                        continue
                    key = {"userId": uid}
                    if len(pk) == 2 and "role" in pk:
                        key["role"] = "Wrestler"
                    try:
                        gi = T_WREST.get_item(
                            Key=key,
                            ProjectionExpression=proj,
                            ExpressionAttributeNames=ean,
                        )
                        it = gi.get("Item")
                        if it:
                            it["stageName"] = it.get("stageName") or it.get("name") or None
                            profiles[uid] = it
                    except Exception as exc:
                        LOGGER.info(
                            "get_item_profile_fallback_failed requestId=%s uid=%s err=%s",
                            req_id,
                            uid,
                            exc,
                        )
            for a in apps:
                uid = a.get("applicantId")
                a["applicantProfile"] = profiles.get(uid, {})
        return _resp(200, {"items": apps, "nextToken": next_token})
    kwargs = {
        "IndexName": "ByApplicant",
        "KeyConditionExpression": Key("applicantIdGsi").eq(sub),
        "Limit": page_size,
    }
    if start_key:
        kwargs["ExclusiveStartKey"] = start_key

    r = T_APP.query(**kwargs)
    next_token = _encode_next_token(r.get("LastEvaluatedKey"))
    return _resp(200, {"items": r.get("Items", []), "nextToken": next_token})