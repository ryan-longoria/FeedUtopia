import re
from boto3.dynamodb.conditions import Key, Attr
import boto3

from http import _resp, _log, _qs, _now_iso
from config import UUID_PATH, DEBUG_TRYOUTS, AWS_REGION
from db.tables import T_TRY
from auth import _is_promoter

def _get_tryouts(event):
    _log("TABLE_TRYOUTS", T_TRY.name)
    items = []
    try:
        r = T_TRY.query(
            IndexName="OpenByDate",
            KeyConditionExpression=Key("status").eq("open"),
            ScanIndexForward=True,
            Limit=100,
        )
        items = r.get("Items", []) or []
        _log("OpenByDate result len", len(items))
    except Exception as e:
        _log("OpenByDate query failed", e)
    if not items:
        try:
            r2 = T_TRY.scan(
                FilterExpression=Attr("status").eq("open"),
                Limit=100,
            )
            items = r2.get("Items", []) or []
            _log("Scan(open) result len", len(items))
        except Exception as e2:
            _log("Fallback scan failed", e2)
            return _resp(500, {"message": "Server error", "where": "_get_tryouts"})
    return _resp(200, items)

def _post_tryout(sub, groups, event):
    from ..http import _json
    if not _is_promoter(groups):
        return _resp(403, {"message": "Promoter role required"})
    data = _json(event)
    status_in = (data.get("status") or "open").strip().lower()
    date_in   = (data.get("date") or "").strip()
    if date_in and not re.match(r"^\d{4}-\d{2}-\d{2}$", date_in):
        return _resp(400, {"message": "date must be YYYY-MM-DD"})
    import uuid
    tid = str(uuid.uuid4())
    slots = int(data.get("slots") or 0)
    if slots < 0: slots = 0
    if slots > 10000: slots = 10000
    item = {
        "tryoutId": tid,
        "ownerId": sub,
        "orgName": (data.get("orgName") or data.get("org") or "").strip(),
        "city": (data.get("city") or "").strip(),
        "date": date_in,
        "slots": slots,
        "requirements": (data.get("requirements") or "").strip(),
        "contact": (data.get("contact") or "").strip(),
        "status": status_in,
        "createdAt": _now_iso(),
    }
    if status_in not in {"open","closed","filled"}:
        status_in = "open"
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
    except Exception as e:
        _log("open tryouts by owner error", e)
        return _resp(500, {"message": "Server error"})

def _debug_tryouts():
    info = {"region": AWS_REGION, "table": T_TRY.name}
    try:
        r = T_TRY.scan(Limit=5)
        items = r.get("Items", []) or []
        info["sample_count"] = len(items)
        if items:
            info["sample"] = items[:1]
    except Exception as e:
        info["error"] = str(e)
    try:
        sts = boto3.client("sts", region_name=AWS_REGION)
        who = sts.get_caller_identity()
        info["account"] = who.get("Account")
        info["arn"] = who.get("Arn")
    except Exception as e:
        info["sts_error"] = str(e)
    return _resp(200, info)
