# lambda_function.py
import json
import os
import re
import uuid
import datetime
from typing import Any, Dict, Tuple, Set, Optional

import boto3
from boto3.dynamodb.conditions import Key, Attr

# ---------- Cold-start init ----------
ddb = boto3.resource("dynamodb")
# Env checks (fail fast if missing)
TABLE_WRESTLERS = os.environ["TABLE_WRESTLERS"]
TABLE_PROMOTERS = os.environ["TABLE_PROMOTERS"]
TABLE_TRYOUTS   = os.environ["TABLE_TRYOUTS"]
TABLE_APPS      = os.environ["TABLE_APPS"]

T_WREST = ddb.Table(TABLE_WRESTLERS)
T_PROMO = ddb.Table(TABLE_PROMOTERS)
T_TRY   = ddb.Table(TABLE_TRYOUTS)
T_APP   = ddb.Table(TABLE_APPS)

# ---------- Small helpers ----------
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
    """Return (sub, groups:set[str]) with robust normalization.

    Handles API Gateway HTTP API v2 quirks:
      - claims keys can vary in case
      - 'cognito:groups' can be a list, a JSON-encoded string, a CSV string, or missing
      - fall back to 'custom:role' when groups are absent
    """
    jwt   = (event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}) or {})
    raw_c = jwt.get("claims") or {}

    # Normalize keys to lowercase for safety
    claims = {str(k).lower(): v for k, v in raw_c.items()}
    sub = claims.get("sub")

    groups: set[str] = set()

    # --- Try 'cognito:groups' first ---
    cg = claims.get("cognito:groups")
    if isinstance(cg, list):
        groups |= {str(x) for x in cg}
    elif isinstance(cg, str):
        s = cg.strip()
        # If it's a JSON array string, parse it
        if s.startswith('[') and s.endswith(']'):
            try:
                arr = json.loads(s)
                if isinstance(arr, list):
                    groups |= {str(x) for x in arr}
            except Exception:
                pass
        if not groups:
            # Fallback to comma/whitespace splitting
            parts = re.split(r"[,\s]+", s)
            groups |= {p for p in (p.strip() for p in parts) if p}

    # --- Fallback: map 'custom:role' -> canonical group name ---
    role = (claims.get("custom:role") or claims.get("custom:role".lower()) or "").strip()
    if role:
        rl = role.lower()
        if rl.startswith("wrestler"):
            groups.add("Wrestlers")
        elif rl.startswith("promoter"):
            groups.add("Promoters")

    return sub, groups

def _now_iso() -> str:
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

def _resp(status: int, body: Any = None) -> Dict[str, Any]:
    # HTTP API CORS is configured at the gateway, so no need to add CORS headers here.
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body if body is not None else {}),
    }

def _is_promoter(groups: Set[str]) -> bool:
    return "Promoters" in groups

def _is_wrestler(groups: Set[str]) -> bool:
    return "Wrestlers" in groups

def _requires_auth(method: str, path: str) -> bool:
    """
    We expose GET /tryouts publicly. Everything else requires a JWT.
    Make sure your API Gateway routes mirror this:
      - GET /tryouts => authorization NONE
      - All other routes => JWT authorizer
    We still keep this guard to be robust if a request hits $default.
    """
    if method == "GET" and path == "/tryouts":
        return False
    return True

def _uuid() -> str:
    return str(uuid.uuid4())

# ---------- Route handlers ----------
def _get_tryouts(event: Dict[str, Any]) -> Dict[str, Any]:
    # List open tryouts by date (GSI OpenByDate: status=partition, date=sort)
    r = T_TRY.query(
        IndexName="OpenByDate",
        KeyConditionExpression=Key("status").eq("open"),
        ScanIndexForward=True,  # ascending by date
        Limit=100,
    )
    return _resp(200, r.get("Items", []))

def _post_tryout(sub: str, groups: Set[str], event: Dict[str, Any]) -> Dict[str, Any]:
    if not _is_promoter(groups):
        return _resp(403, {"message": "Promoter role required"})
    data = _json(event)
    tid = _uuid()
    item = {
        "tryoutId": tid,
        "ownerId": sub,
        "orgName": (data.get("orgName") or data.get("org") or "").strip(),
        "city": (data.get("city") or "").strip(),
        "date": (data.get("date") or "").strip(),
        "slots": int(data.get("slots") or 0),
        "requirements": (data.get("requirements") or "").strip(),
        "contact": (data.get("contact") or "").strip(),
        "status": (data.get("status") or "open").strip() or "open",
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
    style = (qs.get("style") or "").strip()
    city  = (qs.get("city") or "").strip()
    verified = (qs.get("verified") or "").strip().lower()

    fe = None
    try:
        if style:
            cond = Attr("styles").contains(style)
            fe = cond if fe is None else fe & cond

        if city:
            cond = Attr("city").contains(city)
            fe = cond if fe is None else fe & cond

        if verified in ("true", "1", "yes"):
            cond = Attr("verified_school").eq(True)
            fe = cond if fe is None else fe & cond

        if fe is None:
            r = T_WREST.scan(Limit=100)
        else:
            r = T_WREST.scan(FilterExpression=fe, Limit=100)

        items = r.get("Items", [])
        return _resp(200, items)

    except Exception as e:
        print("wrestlers scan error:", repr(e), "qs=", qs)
        return _resp(500, {"message": "Server error", "where": "list_wrestlers", "detail": str(e)})


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
                "applicantIdGsi": sub,
                "timestamp": now,
                "notes": (data.get("notes") or "").strip(),
                "reelLink": (data.get("reelLink") or "").strip(),
                "status": "submitted",
            },
            # one application per wrestler per tryout
            ConditionExpression="attribute_not_exists(tryoutId) AND attribute_not_exists(applicantId)",
        )
    except Exception as e:
        # Likely a ConditionalCheckFailedException (duplicate)
        # return 200 to keep UX smooth, but indicate already exists
        msg = str(getattr(e, "response", {}).get("Error", {}).get("Code", "")) or str(e)
        return _resp(200, {"ok": True, "tryoutId": tryout_id, "note": "already_applied", "detail": msg})

    return _resp(200, {"ok": True, "tryoutId": tryout_id})

def _get_applications(sub: str, event: Dict[str, Any]) -> Dict[str, Any]:
    qs = _qs(event)
    if "tryoutId" in qs:
        tryout_id = qs["tryoutId"]
        # verify ownership of the tryout
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
    # wrestler: list their own applications via GSI
    r = T_APP.query(
        IndexName="ByApplicant",
        KeyConditionExpression=Key("applicantIdGsi").eq(sub),
        Limit=200,
    )
    return _resp(200, r.get("Items", []))

# ---------- Entrypoint ----------
def lambda_handler(event, _ctx):
    """
    HTTP API (payload v2.0) entrypoint.
    - OPTIONS returns 204 before any auth checks (CORS preflight).
    - GET /tryouts is public (no JWT required).
    - All other routes require a valid JWT and are role-gated.
    """
    try:
        method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
        path = _path(event)

        # --- 1) Handle CORS preflight early (no auth) ---
        if method == "OPTIONS":
            return {
                "statusCode": 204,
                "headers": {"content-type": "application/json"},
                "body": "",
            }

        # --- 2) Public route (no auth): GET /tryouts ---
        if method == "GET" and path == "/tryouts":
            return _get_tryouts(event)

        # --- 3) Protected routes (require JWT) ---
        sub, groups = _claims(event)
        if not sub:
            return _resp(401, {"message": "Unauthorized"})

        # Health check (protected to avoid abuse; call with a token)
        if path == "/health":
            return _resp(200, {"ok": True, "time": _now_iso()})

        # Wrestler profiles
        if path.startswith("/profiles/wrestlers"):
            if method in ("POST", "PUT", "PATCH"):
                return _upsert_wrestler_profile(sub, groups, event)
            if method == "GET":
                return _list_wrestlers(groups, event)

        # Promoter profiles
        if path.startswith("/profiles/promoters"):
            if method in ("POST", "PUT", "PATCH"):
                return _upsert_promoter_profile(sub, groups, event)
            if method == "GET":
                return _get_promoter_profile(sub)

        # Tryouts collection
        if path == "/tryouts":
            if method == "POST":
                return _post_tryout(sub, groups, event)

        # Tryout by id
        if path.startswith("/tryouts/"):
            tryout_id = path.split("/")[-1]
            if method == "GET":
                return _get_tryout(tryout_id)
            if method == "DELETE":
                return _delete_tryout(sub, tryout_id)

        # Applications
        if path == "/applications":
            if method == "POST":
                return _post_application(sub, groups, event)
            if method == "GET":
                return _get_applications(sub, event)

        # No match
        return _resp(404, {"message": "Route not found"})

    except Exception as e:
        # Log the full event only in dev if you want; here we keep response minimal.
        # print("ERROR:", repr(e), "EVENT:", json.dumps(event))  # (optional)
        return _resp(500, {"message": "Server error", "detail": str(e)})
