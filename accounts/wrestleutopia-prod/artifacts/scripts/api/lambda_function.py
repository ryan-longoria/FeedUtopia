# lambda_function.py
import json
import os
import re
import uuid
import datetime
from typing import Any, Dict, Set
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key, Attr

# ------------------------------------------------------------------------------
# Cold-start init
# ------------------------------------------------------------------------------

AWS_REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-2"
DEBUG_TRYOUTS = (os.environ.get("DEBUG_TRYOUTS") or "").strip().lower() in {"1", "true", "yes"}
UUID_PATH = re.compile(r"^/tryouts/[0-9a-fA-F-]{36}$")

# Prefer explicit region to avoid accidental cross-region connections
ddb = boto3.resource("dynamodb", region_name=AWS_REGION)

# Env checks (fail fast if missing / wrong)
TABLE_WRESTLERS = os.environ["TABLE_WRESTLERS"]
TABLE_PROMOTERS = os.environ["TABLE_PROMOTERS"]
TABLE_TRYOUTS   = os.environ["TABLE_TRYOUTS"]
TABLE_APPS      = os.environ["TABLE_APPS"]

T_WREST = ddb.Table(TABLE_WRESTLERS)
T_PROMO = ddb.Table(TABLE_PROMOTERS)
T_TRY   = ddb.Table(TABLE_TRYOUTS)
T_APP   = ddb.Table(TABLE_APPS)

def _log(*args):
    # Simple log helper (stringifies safely)
    print("[WU]", *[repr(a) for a in args])

# Log table wiring once at cold start
_log("REGION", AWS_REGION, "TABLES", {
    "wrestlers": TABLE_WRESTLERS,
    "promoters": TABLE_PROMOTERS,
    "tryouts": TABLE_TRYOUTS,
    "apps": TABLE_APPS,
})

# ------------------------------------------------------------------------------
# Small helpers
# ------------------------------------------------------------------------------

def _jsonify(data):
    if isinstance(data, Decimal):
        return int(data) if data % 1 == 0 else float(data)
    if isinstance(data, list):
        return [_jsonify(x) for x in data]
    if isinstance(data, dict):
        return {k: _jsonify(v) for k, v in data.items()}
    return data

def _json(event: Dict[str, Any]) -> Dict[str, Any]:
    try:
        return json.loads(event.get("body") or "{}")
    except Exception:
        return {}

def _path(event: Dict[str, Any]) -> str:
    return (event.get("rawPath") or "/").rstrip("/")

def _qs(event: Dict[str, Any]) -> Dict[str, str]:
    return event.get("queryStringParameters") or {}

def _claims(event):
    """
    Return (sub, groups:set[str]) with robust normalization of Cognito claims.
    """
    jwt   = (event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}) or {})
    raw_c = jwt.get("claims") or {}

    claims = {str(k).lower(): v for k, v in raw_c.items()}
    sub = claims.get("sub")

    groups: set[str] = set()

    # Try 'cognito:groups' first
    cg = claims.get("cognito:groups")
    if isinstance(cg, list):
        groups |= {str(x) for x in cg}
    elif isinstance(cg, str):
        s = cg.strip()
        if s.startswith('[') and s.endswith(']'):
            try:
                arr = json.loads(s)
                if isinstance(arr, list):
                    groups |= {str(x) for x in arr}
            except Exception:
                pass
        if not groups:
            parts = re.split(r"[,\s]+", s)
            groups |= {p for p in (p.strip() for p in parts) if p}

    # Fallback from custom:role
    role = (claims.get("custom:role") or "").strip().lower()
    if role:
        if role.startswith("wrestler"):
            groups.add("Wrestlers")
        elif role.startswith("promoter"):
            groups.add("Promoters")

    return sub, groups

def _now_iso() -> str:
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

def _resp(status: int, body: Any = None) -> Dict[str, Any]:
    # CORS is handled at API Gateway, but content-type here helps clients.
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(_jsonify(body if body is not None else {})),
    }

def _is_promoter(groups: Set[str]) -> bool:
    return "Promoters" in groups

def _is_wrestler(groups: Set[str]) -> bool:
    return "Wrestlers" in groups

def _uuid() -> str:
    return str(uuid.uuid4())

# ------------------------------------------------------------------------------
# Route handlers
# ------------------------------------------------------------------------------

def _get_tryouts(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Return open tryouts. Prefer GSI(OpenByDate) -> fallback scan(status='open').
    Logs table name and result lengths to catch region/table mismatches.
    """
    _log("TABLE_TRYOUTS", TABLE_TRYOUTS)
    items = []

    # 1) GSI query
    try:
        r = T_TRY.query(
            IndexName="OpenByDate",
            KeyConditionExpression=Key("status").eq("open"),
            ScanIndexForward=True,   # ascending by date
            Limit=100,
        )
        items = r.get("Items", []) or []
        _log("OpenByDate result len", len(items))
    except Exception as e:
        _log("OpenByDate query failed", e)

    # 2) Fallback scan if GSI empty/not ready or data not normalized
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

def _post_tryout(sub: str, groups: Set[str], event: Dict[str, Any]) -> Dict[str, Any]:
    if not _is_promoter(groups):
        return _resp(403, {"message": "Promoter role required"})

    data = _json(event)

    # Normalize critical fields
    status_in = (data.get("status") or "open").strip().lower()
    date_in   = (data.get("date") or "").strip()  # expected 'YYYY-MM-DD'
    # optional: minimal date format validation
    if date_in and not re.match(r"^\d{4}-\d{2}-\d{2}$", date_in):
        return _resp(400, {"message": "date must be YYYY-MM-DD"})

    tid = _uuid()
    item = {
        "tryoutId": tid,
        "ownerId": sub,
        "orgName": (data.get("orgName") or data.get("org") or "").strip(),
        "city": (data.get("city") or "").strip(),
        "date": date_in,
        "slots": int(data.get("slots") or 0),
        "requirements": (data.get("requirements") or "").strip(),
        "contact": (data.get("contact") or "").strip(),
        "status": status_in,
        "createdAt": _now_iso(),
    }
    T_TRY.put_item(Item=item)
    return _resp(200, item)

def _get_tryout(tryout_id: str) -> Dict[str, Any]:
    item = T_TRY.get_item(Key={"tryoutId": tryout_id}).get("Item")
    return _resp(200, item or {})

def _delete_tryout(sub: str, tryout_id: str) -> Dict[str, Any]:
    item = T_TRY.get_item(Key={"tryoutId": tryout_id}).get("Item")
    if not item:
        return _resp(404, {"message": "Not found"})
    if item.get("ownerId") != sub:
        return _resp(403, {"message": "Not your tryout"})
    T_TRY.delete_item(Key={"tryoutId": tryout_id})
    return _resp(200, {"ok": True})

def _upsert_wrestler_profile(sub: str, groups: Set[str], event: Dict[str, Any]) -> Dict[str, Any]:
    if not _is_wrestler(groups):
        return _resp(403, {"message": "Wrestler role required"})
    data = _json(event)
    data["userId"] = sub
    data.setdefault("role", "Wrestler")
    T_WREST.put_item(Item=data)
    return _resp(200, {"ok": True, "userId": sub})

def _list_wrestlers(groups: Set[str], event: Dict[str, Any]) -> Dict[str, Any]:
    if not _is_promoter(groups):
        return _resp(403, {"message": "Promoter role required to view wrestler profiles"})

    qs = _qs(event)
    style    = (qs.get("style") or "").strip()
    city     = (qs.get("city") or "").strip()
    verified = (qs.get("verified") or "").strip().lower()

    fe = None
    try:
        if style:
            cond = Attr("styles").contains(style)
            fe = cond if fe is None else fe & cond

        if city:
            cond = Attr("city").contains(city)
            fe = cond if fe is None else fe & cond

        if verified in {"true", "1", "yes"}:
            cond = Attr("verified_school").eq(True)
            fe = cond if fe is None else fe & cond

        if fe is None:
            r = T_WREST.scan(Limit=100)
        else:
            r = T_WREST.scan(FilterExpression=fe, Limit=100)

        items = r.get("Items", [])
        return _resp(200, items)

    except Exception as e:
        _log("wrestlers scan error", e, "qs=", qs)
        return _resp(500, {"message": "Server error", "where": "list_wrestlers"})

def _upsert_promoter_profile(sub: str, groups: Set[str], event: Dict[str, Any]) -> Dict[str, Any]:
    if not _is_promoter(groups):
        return _resp(403, {"message": "Promoter role required"})
    data = _json(event)
    data["userId"] = sub
    data.setdefault("role", "Promoter")
    T_PROMO.put_item(Item=data)
    return _resp(200, {"ok": True, "userId": sub})

def _get_promoter_profile(sub: str) -> Dict[str, Any]:
    item = T_PROMO.get_item(Key={"userId": sub}).get("Item")
    return _resp(200, item or {})

def _post_application(sub: str, groups: Set[str], event: Dict[str, Any]) -> Dict[str, Any]:
    if not _is_wrestler(groups):
        return _resp(403, {"message": "Wrestler role required"})
    data = _json(event)
    tryout_id = (data.get("tryoutId") or "").strip()
    if not tryout_id:
        return _resp(400, {"message": "tryoutId required"})

    now = _now_iso()
    try:
        T_APP.put_item(
            Item={
                "tryoutId": tryout_id,
                "applicantId": sub,
                "applicantIdGsi": sub,  # GSI to list a wrestler's apps
                "timestamp": now,
                "notes": (data.get("notes") or "").strip(),
                "reelLink": (data.get("reelLink") or "").strip(),
                "status": "submitted",
            },
            ConditionExpression=(
                "attribute_not_exists(tryoutId) AND attribute_not_exists(applicantId)"
            ),  # one app per wrestler per tryout
        )
    except Exception as e:
        # duplicate (ConditionalCheckFailed) -> return ok to keep UX smooth
        code = getattr(getattr(e, "response", {}), "get", lambda *_: {})("Error", {}).get("Code") if hasattr(e, "response") else ""
        _log("post_application put_item exception", e, "code", code)
        return _resp(200, {"ok": True, "tryoutId": tryout_id, "note": "already_applied"})

    return _resp(200, {"ok": True, "tryoutId": tryout_id})

def _get_applications(sub: str, event: Dict[str, Any]) -> Dict[str, Any]:
    qs = _qs(event)
    if "tryoutId" in qs:
        tryout_id = qs["tryoutId"]
        tr = T_TRY.get_item(Key={"tryoutId": tryout_id}).get("Item")
        if not tr:
            return _resp(404, {"message": "Tryout not found"})
        if tr.get("ownerId") != sub:
            return _resp(403, {"message": "Not your tryout"})
        r = T_APP.query(
            KeyConditionExpression=Key("tryoutId").eq(tryout_id),
            Limit=200,
        )
        return _resp(200, r.get("Items", []))

    # Wrestler: list own apps via GSI
    r = T_APP.query(
        IndexName="ByApplicant",
        KeyConditionExpression=Key("applicantIdGsi").eq(sub),
        Limit=200,
    )
    return _resp(200, r.get("Items", []))

# ------------------------------------------------------------------------------
# Entrypoint
# ------------------------------------------------------------------------------

def lambda_handler(event, _ctx):
    try:
        method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
        path = _path(event)

        # 1) CORS preflight
        if method == "OPTIONS":
            return {"statusCode": 204, "headers": {"content-type": "application/json"}, "body": ""}

        # 2) PUBLIC endpoints (no JWT)
        if method == "GET" and path == "/tryouts":
            # public list of open tryouts
            return _get_tryouts(event)

        # only treat as /tryouts/{id} if {id} looks like a UUID (prevents catching /tryouts/mine)
        if method == "GET" and UUID_PATH.fullmatch(path):
            tryout_id = path.rsplit("/", 1)[1]
            return _get_tryout(tryout_id)

        # 3) AUTH-required endpoints
        sub, groups = _claims(event)
        if not sub:
            return _resp(401, {"message": "Unauthorized"})

        # Health (protected to avoid abuse)
        if path == "/health":
            return _resp(200, {"ok": True, "time": _now_iso()})

        # Wrestler profiles
        if path.startswith("/profiles/wrestlers"):
            if method in ("POST", "PUT", "PATCH"):
                return _upsert_wrestler_profile(sub, groups, event)
            if method == "GET":
                if _is_wrestler(groups):
                    item = T_WREST.get_item(Key={"userId": sub}).get("Item") or {}
                    return _resp(200, item)
                if _is_promoter(groups):
                    return _list_wrestlers(groups, event)

        # Promoter profiles
        if path.startswith("/profiles/promoters"):
            if method in ("POST", "PUT", "PATCH"):
                return _upsert_promoter_profile(sub, groups, event)
            if method == "GET":
                return _get_promoter_profile(sub)

        # Tryouts (auth-only variants)
        if path == "/tryouts":
            if method == "POST":
                return _post_tryout(sub, groups, event)

        # Promoter: list my tryouts (separate path so /tryouts stays public)
        if path == "/tryouts/mine" and method == "GET":
            if not _is_promoter(groups):
                return _resp(403, {"message": "Promoter role required"})
            r = T_TRY.query(
                IndexName="ByOwner",
                KeyConditionExpression=Key("ownerId").eq(sub),
                ScanIndexForward=False,
                Limit=100,
            )
            return _resp(200, r.get("Items", []))

        # Tryout by id (auth-only actions)
        if path.startswith("/tryouts/"):
            tryout_id = path.split("/")[-1]
            if method == "DELETE":
                return _delete_tryout(sub, tryout_id)

        # Applications
        if path == "/applications":
            if method == "POST":
                return _post_application(sub, groups, event)
            if method == "GET":
                return _get_applications(sub, event)

        # TEMP: debug endpoint (JWT required) — enable with env DEBUG_TRYOUTS=true
        if DEBUG_TRYOUTS and path == "/debug/tryouts" and method == "GET":
            info = {"region": AWS_REGION, "table": TABLE_TRYOUTS}
            try:
                # small scan to confirm the table we're actually reading
                r = T_TRY.scan(Limit=5)
                items = r.get("Items", []) or []
                info["sample_count"] = len(items)
                if items:
                    # include one sample item only
                    info["sample"] = items[:1]
            except Exception as e:
                info["error"] = str(e)
            # optional: include caller/account during deep debugging
            try:
                sts = boto3.client("sts", region_name=AWS_REGION)
                who = sts.get_caller_identity()
                info["account"] = who.get("Account")
                info["arn"] = who.get("Arn")
            except Exception as e:
                info["sts_error"] = str(e)
            return _resp(200, info)

        return _resp(404, {"message": "Route not found"})

    except Exception as e:
        _log("UNHANDLED", e)
        return _resp(500, {"message": "Server error", "detail": str(e)})
