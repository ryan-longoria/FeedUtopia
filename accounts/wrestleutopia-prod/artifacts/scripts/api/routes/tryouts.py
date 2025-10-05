from __future__ import annotations

import base64
import json
import logging
import re
import uuid
from typing import Any, Dict, Optional, Tuple

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

from auth import _is_promoter
from config import get_config
from db.tables import T_TRY
from http_utils import _now_iso, _qs, _resp

LOGGER = logging.getLogger("wrestleutopia.routes.tryouts")
_CFG = get_config()

_MAX_SCAN_LIMIT = 100
_DEFAULT_LIMIT = 50
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$", re.ASCII)
_ALLOWED_STATUS = {"open", "closed", "filled"}

_TRYOUT_PROJECTION = (
    "tryoutId, ownerId, orgName, city, #d, slots, requirements, contact, "
    "#s, createdAt"
)
_TRYOUT_EAN = {"#d": "date", "#s": "status"}


def _request_id(event: Dict[str, Any]) -> str:
    """Extract the API Gateway/Lambda request id for correlation."""
    ctx = event.get("requestContext", {}) or {}
    return str(ctx.get("requestId") or "unknown")


def _parse_pagination(qs: Dict[str, Any]) -> Tuple[int, Optional[Dict[str, Any]]]:
    """Parse 'limit' and 'cursor' (base64 JSON) from querystring."""
    try:
        limit = int(qs.get("limit", _DEFAULT_LIMIT))
    except Exception:
        limit = _DEFAULT_LIMIT
    limit = max(1, min(limit, _MAX_SCAN_LIMIT))

    cursor_raw = qs.get("cursor")
    exclusive_start_key = None
    if cursor_raw:
        try:
            decoded = base64.urlsafe_b64decode(cursor_raw.encode("utf-8")).decode(
                "utf-8"
            )
            exclusive_start_key = json.loads(decoded)
        except Exception:
            exclusive_start_key = None
    return limit, exclusive_start_key


def _encode_cursor(last_evaluated_key: Optional[Dict[str, Any]]) -> Optional[str]:
    """Encode a DynamoDB LastEvaluatedKey into a cursor string."""
    if not last_evaluated_key:
        return None
    s = json.dumps(last_evaluated_key, separators=(",", ":"))
    return base64.urlsafe_b64encode(s.encode("utf-8")).decode("utf-8")


def _validate_date(yyyy_mm_dd: str) -> bool:
    """Return True if yyyy-mm-dd string matches strict format."""
    return bool(_DATE_RE.fullmatch(yyyy_mm_dd))


def _safe_str(s: Any, max_len: int = 128) -> str:
    """Return a trimmed, bounded string to avoid large/PII logs."""
    return (str(s or "").strip())[:max_len]


def _get_tryouts(event):
    """Return open tryouts with optional pagination, preferring the GSI."""
    req_id = _request_id(event)
    qs = _qs(event)
    limit, eks = _parse_pagination(qs)

    LOGGER.info("get_tryouts start req_id=%s", req_id)

    items = []
    last_key = None

    try:
        q_kwargs = {
            "IndexName": "OpenByDate",
            "KeyConditionExpression": Key("status").eq("open"),
            "ScanIndexForward": True,
            "Limit": limit,
        }
        if eks:
            q_kwargs["ExclusiveStartKey"] = eks

        resp = T_TRY.query(**q_kwargs)
        items = resp.get("Items", []) or []
        last_key = resp.get("LastEvaluatedKey")
        LOGGER.debug(
            "get_tryouts gsi_ok req_id=%s count=%d has_more=%s",
            req_id,
            len(items),
            bool(last_key),
        )
    except Exception as exc:
        LOGGER.error("get_tryouts gsi_error req_id=%s err=%s", req_id, exc)

    if not items:
        try:
            scan_kwargs = {
                "FilterExpression": Attr("status").eq("open"),
                "ProjectionExpression": _TRYOUT_PROJECTION,
                "ExpressionAttributeNames": _TRYOUT_EAN,
                "Limit": limit,
            }
            if eks:
                scan_kwargs["ExclusiveStartKey"] = eks

            resp2 = T_TRY.scan(**scan_kwargs)
            items = resp2.get("Items", []) or []
            last_key = resp2.get("LastEvaluatedKey")
            LOGGER.warning(
                "get_tryouts scan_fallback req_id=%s count=%d has_more=%s",
                req_id,
                len(items),
                bool(last_key),
            )
        except Exception as exc:
            LOGGER.error("get_tryouts scan_error req_id=%s err=%s", req_id, exc)
            return _resp(500, {"message": "Server error", "where": "_get_tryouts"})

    return _resp(
        200,
        {
            "items": items,
            "cursor": _encode_cursor(last_key),
            "limit": limit,
        },
    )


def _post_tryout(sub, groups, event):
    """Create a tryout (promoter-only) with strict validation and idempotency."""
    from http_utils import _json

    req_id = _request_id(event)

    if not _is_promoter(groups):
        return _resp(403, {"message": "Promoter role required"})

    data = _json(event) or {}

    status_in = (data.get("status") or "open").strip().lower()
    if status_in not in _ALLOWED_STATUS:
        status_in = "open"

    date_in = (data.get("date") or "").strip()
    if date_in and not _validate_date(date_in):
        return _resp(400, {"message": "date must be YYYY-MM-DD"})

    try:
        slots = int(data.get("slots") or 0)
    except Exception:
        return _resp(400, {"message": "slots must be an integer"})
    slots = max(0, min(10_000, slots))

    org_name = _safe_str(data.get("orgName") or data.get("org"), max_len=128)
    city = _safe_str(data.get("city"), max_len=96)
    requirements = _safe_str(data.get("requirements"), max_len=2048)
    contact = _safe_str(data.get("contact"), max_len=256)

    tryout_id = str(uuid.uuid4())
    item = {
        "tryoutId": tryout_id,
        "ownerId": sub,
        "orgName": org_name,
        "city": city,
        "date": date_in,
        "slots": slots,
        "requirements": requirements,
        "contact": contact,
        "status": status_in,
        "createdAt": _now_iso(),
    }

    try:
        T_TRY.put_item(
            Item=item,
            ConditionExpression="attribute_not_exists(tryoutId)",
        )
    except ClientError as exc:
        if exc.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            LOGGER.info("post_tryout idempotent req_id=%s tryoutId=%s", req_id, tryout_id)
            return _resp(200, item)
        LOGGER.error("post_tryout put_error req_id=%s err=%s", req_id, exc)
        return _resp(500, {"message": "Server error", "where": "_post_tryout"})

    LOGGER.info("post_tryout ok req_id=%s tryoutId=%s", req_id, tryout_id)
    return _resp(200, item)


def _get_tryout(tryout_id: str):
    """Fetch a single tryout by ID (public)."""
    item = T_TRY.get_item(Key={"tryoutId": tryout_id}).get("Item")
    return _resp(200, item or {})


def _delete_tryout(sub: str, tryout_id: str):
    """Delete a tryout if caller owns it, guarding with a conditional delete."""
    item = T_TRY.get_item(Key={"tryoutId": tryout_id}).get("Item")
    if not item:
        return _resp(404, {"message": "Not found"})
    if item.get("ownerId") != sub:
        return _resp(403, {"message": "Not your tryout"})

    try:
        T_TRY.delete_item(
            Key={"tryoutId": tryout_id},
            ConditionExpression="attribute_exists(tryoutId) AND ownerId = :u",
            ExpressionAttributeValues={":u": sub},
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code == "ConditionalCheckFailedException":
            return _resp(409, {"message": "Tryout changed; refresh and retry"})
        LOGGER.error("delete_tryout error tryoutId=%s err=%s", tryout_id, exc)
        return _resp(500, {"message": "Server error"})

    return _resp(200, {"ok": True})


def _get_open_tryouts_by_owner(
    owner_id: str, event: Dict[str, Any] | None = None
):
    """Return open tryouts for a given owner with pagination."""
    qs = (event or {}).get("queryStringParameters") or {}
    next_token = (qs.get("nextToken") or "").strip()

    start_key = None
    if next_token:
        try:
            import base64, json as _json
            start_key = _json.loads(base64.urlsafe_b64decode(
                next_token.encode("utf-8")
            ).decode("utf-8"))
        except Exception:
            start_key = None

    params = {
        "IndexName": "ByOwner",
        "KeyConditionExpression": Key("ownerId").eq(owner_id),
        "ScanIndexForward": True,
        "Limit": 100,
    }
    if start_key:
        params["ExclusiveStartKey"] = start_key

    try:
        r = T_TRY.query(**params)
        items = [it for it in (r.get("Items") or []) if (
            it.get("status") or "open"
        ) == "open"]
        lek = r.get("LastEvaluatedKey")
        nt = None
        if lek:
            import base64, json as _json
            nt = base64.urlsafe_b64encode(_json.dumps(
                lek, separators=(",", ":")
            ).encode("utf-8")).decode("utf-8")
        return _resp(200, {"items": items, "nextToken": nt})
    except Exception as e:
        LOGGER.error("owner_tryouts_error err=%s", e)
        return _resp(500, {"message": "Server error"})


def _debug_tryouts():
    """Return a small, non-sensitive diagnostic payload."""
    info = {"region": _CFG.aws_region, "table": T_TRY.name}
    try:
        resp = T_TRY.scan(
            Limit=5,
            ProjectionExpression=_TRYOUT_PROJECTION,
            ExpressionAttributeNames=_TRYOUT_EAN,
        )
        items = resp.get("Items", []) or []
        info["sample_count"] = len(items)
        if items:
            info["sample"] = [
                {
                    "tryoutId": items[0].get("tryoutId"),
                    "ownerId": items[0].get("ownerId"),
                    "status": items[0].get("status"),
                    "date": items[0].get("date"),
                }
            ]
    except Exception as exc:
        info["error"] = str(exc)

    try:
        sts = boto3.client("sts", region_name=_CFG.aws_region)
        who = sts.get_caller_identity()
        info["account"] = who.get("Account")
        info["arn"] = who.get("Arn")
    except Exception as exc:
        info["sts_error"] = str(exc)

    return _resp(200, info)