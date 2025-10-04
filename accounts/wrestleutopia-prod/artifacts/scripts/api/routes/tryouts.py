# tryouts.py
from __future__ import annotations

import logging
import re

import boto3
from boto3.dynamodb.conditions import Attr, Key

from auth import _is_promoter
from db.tables import T_TRY
from http_utils import _now_iso, _qs, _resp

LOGGER = logging.getLogger("wrestleutopia.routes.tryouts")


def _get_tryouts(event):
    LOGGER.info("table_tryouts=%s", T_TRY.name)
    items = []

    # 1) GSI query
    try:
        r = T_TRY.query(
            IndexName="OpenByDate",
            KeyConditionExpression=Key("status").eq("open"),
            ScanIndexForward=True,  # ascending by date
            Limit=100,
        )
        items = r.get("Items", []) or []
        LOGGER.debug("open_by_date_count=%d", len(items))
    except Exception as exc:  # noqa: BLE001
        LOGGER.debug("open_by_date_query_failed error=%s", exc)

    # 2) Fallback scan if GSI empty/not ready or data not normalized
    if not items:
        try:
            r2 = T_TRY.scan(FilterExpression=Attr("status").eq("open"), Limit=100)
            items = r2.get("Items", []) or []
            LOGGER.debug("fallback_scan_open_count=%d", len(items))
        except Exception as exc:  # noqa: BLE001
            LOGGER.error("tryouts_scan_failed error=%s", exc)
            return _resp(500, {"message": "Server error", "where": "_get_tryouts"})

    return _resp(200, items)


def _post_tryout(sub, groups, event):
    from http_utils import _json  # local import to avoid circulars

    if not _is_promoter(groups):
        return _resp(403, {"message": "Promoter role required"})

    data = _json(event)

    status_in = (data.get("status") or "open").strip().lower()
    date_in = (data.get("date") or "").strip()
    if date_in and not re.match(r"^\d{4}-\d{2}-\d{2}$", date_in):
        return _resp(400, {"message": "date must be YYYY-MM-DD"})

    import uuid

    tid = str(uuid.uuid4())
    slots = int(data.get("slots") or 0)
    slots = max(0, min(10000, slots))

    item = {
        "tryoutId": tid,
        "ownerId": sub,
        "orgName": (data.get("orgName") or data.get("org") or "").strip(),
        "city": (data.get("city") or "").strip(),
        "date": date_in,
        "slots": slots,
        "requirements": (data.get("requirements") or "").strip(),
        "contact": (data.get("contact") or "").strip(),
        "status": status_in if status_in in {"open", "closed", "filled"} else "open",
        "createdAt": _now_iso(),
    }

    T_TRY.put_item(Item=item)
    return _resp(200, item)


def _get_tryout(tryout_id: str):
    item = T_TRY.get_item(Key={"tryoutId": tryout_id}).get("Item")
    return _resp(200, item or {})


def _delete_tryout(sub: str, tryout_id: str):
    item = T_TRY.get_item(Key={"tryoutId": tryout_id}).get("Item")
    if not item:
        return _resp(404, {"message": "Not found"})
    if item.get("ownerId") != sub:
        return _resp(403, {"message": "Not your tryout"})
    T_TRY.delete_item(Key={"tryoutId": tryout_id})
    return _resp(200, {"ok": True})


def _get_open_tryouts_by_owner(owner_id: str):
    try:
        r = T_TRY.query(
            IndexName="ByOwner",
            KeyConditionExpression=Key("ownerId").eq(owner_id),
            Limit=100,
            ScanIndexForward=True,
        )
        items = [it for it in (r.get("Items") or []) if (it.get("status") or "open") == "open"]
        return _resp(200, items)
    except Exception as exc:  # noqa: BLE001
        LOGGER.error("owner_tryouts_error error=%s", exc)
        return _resp(500, {"message": "Server error"})


def _debug_tryouts():
    from config import get_config
    cfg = get_config()
    info = {"region": cfg.aws_region, "table": T_TRY.name}
    try:
        r = T_TRY.scan(Limit=5)
        items = r.get("Items", []) or []
        info["sample_count"] = len(items)
        if items:
            info["sample"] = items[:1]
    except Exception as exc:  # noqa: BLE001
        info["error"] = str(exc)

    try:
        from config import get_config
        sts = boto3.client("sts", region_name=get_config().aws_region)
        who = sts.get_caller_identity()
        info["account"] = who.get("Account")
        info["arn"] = who.get("Arn")
    except Exception as exc:  # noqa: BLE001
        info["sts_error"] = str(exc)

    return _resp(200, info)
