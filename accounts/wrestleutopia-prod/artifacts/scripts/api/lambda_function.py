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
from botocore.exceptions import ClientError
from boto3.dynamodb.types import TypeSerializer

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

# Handles table (PK: handle) to reserve unique slugs
TABLE_HANDLES   = os.environ["TABLE_HANDLES"]
T_HANDLES       = ddb.Table(TABLE_HANDLES)

HANDLE_RE = re.compile(r"[^a-z0-9]+")
MAX_BIO_LEN = 1500
MAX_GIMMICKS = 10
SER = TypeSerializer()

def _log(*args):
    # Simple log helper (stringifies safely)
    print("[WU]", *[repr(a) for a in args])

# Log table wiring once at cold start
_log("REGION", AWS_REGION, "TABLES", {
    "wrestlers": TABLE_WRESTLERS,
    "promoters": TABLE_PROMOTERS,
    "tryouts": TABLE_TRYOUTS,
    "apps": TABLE_APPS,
    "handles": TABLE_HANDLES,
})

# ------------------------------------------------------------------------------
# Small helpers
# ------------------------------------------------------------------------------

def _av_map(pyobj: dict) -> dict:
    # Convert a Python dict to DynamoDB AttributeValue map, skipping None
    return {k: SER.serialize(v) for k, v in pyobj.items() if v is not None}

def _slugify_handle(stage_name: str) -> str:
    s = (stage_name or "").strip().lower()
    s = HANDLE_RE.sub("-", s).strip("-")
    return s or None

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

# ---------------- Wrestler Profiles (self-serve + promoter list + public read) --

def _upsert_wrestler_profile(sub: str, groups: Set[str], event: Dict[str, Any]) -> Dict[str, Any]:
    # Legacy upsert (kept for backwards compatibility with older clients)
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
            cond = Attr("gimmicks").contains(style)  # styles/gimmicks stored here
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

def _put_me_profile(sub: str, groups: Set[str], event: Dict[str, Any]) -> Dict[str, Any]:
    if not _is_wrestler(groups):
        return _resp(403, {"message": "Wrestler role required"})

    data = _json(event)

    # Required
    name      = (data.get("name") or "").strip()
    stage     = (data.get("stageName") or "").strip()
    dob       = (data.get("dob") or "").strip()
    city      = (data.get("city") or "").strip()
    country   = (data.get("country") or "").strip()
    region    = (data.get("region") or "").strip()

    if not (name and stage and dob and city and country):
        return _resp(400, {"message": "Missing required fields (name, stageName, dob, city, country)"})

    # Optional/clean
    bio = (data.get("bio") or "").strip()
    if len(bio) > MAX_BIO_LEN:
        return _resp(400, {"message": f"bio too long (max {MAX_BIO_LEN})"})
    gimmicks = data.get("gimmicks") or []
    if isinstance(gimmicks, str):
        gimmicks = [x.strip() for x in gimmicks.split(",") if x.strip()]
    gimmicks = list(dict.fromkeys(gimmicks))[:MAX_GIMMICKS]  # unique + cap
    photo_key = (data.get("photoKey") or "").strip() or None

    # Build handle from stage name
    handle = _slugify_handle(stage)
    if not handle:
        return _resp(400, {"message": "Invalid stageName for handle"})

    now = _now_iso()
    profile = {
        "userId": sub,
        "name": name,
        "stageName": stage,
        "dob": dob,
        "city": city,
        "region": region or None,
        "country": country,
        "bio": bio or None,
        "gimmicks": gimmicks or None,
        "photoKey": photo_key,
        "handle": handle,          # for GSI
        "updatedAt": now,
        "createdAt": now,          # ok to overwrite on first write
        "role": "Wrestler",
    }

    # Helper: try reserve handle only (non-transactional)
    def _reserve_handle(owner: str, h: str) -> bool:
        try:
            T_HANDLES.put_item(
                Item={"handle": h, "owner": owner},
                ConditionExpression="attribute_not_exists(handle) OR #owner = :u",
                ExpressionAttributeNames={"#owner": "owner"},
                ExpressionAttributeValues={":u": owner},
            )
            return True
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code")
            if code in ("ConditionalCheckFailedException", "TransactionCanceledException"):
                return False
            raise

    # Preferred path: transaction (atomic)
    try:
        ddb.meta.client.transact_write_items(
            TransactItems=[
                {
                    "Put": {
                        "TableName": TABLE_WRESTLERS,
                        "Item": _av_map(profile),
                        "ConditionExpression": "attribute_not_exists(userId) OR userId = :u",
                        "ExpressionAttributeValues": {":u": {"S": sub}},
                    }
                },
                {
                    "Put": {
                        "TableName": TABLE_HANDLES,
                        "Item": {"handle": {"S": handle}, "owner": {"S": sub}},
                        "ConditionExpression": "attribute_not_exists(handle) OR owner = :u",
                        "ExpressionAttributeNames": {"#owner": "owner"},
                        "ExpressionAttributeValues": {":u": {"S": sub}},
                    }
                },
            ]
        )
        return _resp(200, {**profile})
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        _log("put_me_profile transact error", code, str(e))

        # If the handle is already owned by someone else → 409
        if code in ("TransactionCanceledException", "ConditionalCheckFailedException"):
            return _resp(409, {"message": "Stage name handle already taken"})

        # If transactions aren’t allowed (common IAM gap), fall back to two writes
        if code in ("AccessDeniedException", "AccessDenied", "MissingAuthenticationToken"):
            try:
                # 1) Reserve handle (fails if taken by another)
                ok = _reserve_handle(sub, handle)
                if not ok:
                    return _resp(409, {"message": "Stage name handle already taken"})
                # 2) Save profile (non-conditional put; last-write-wins for own row)
                T_WREST.put_item(Item=profile)
                return _resp(200, {**profile})
            except ClientError as e2:
                _log("put_me_profile fallback error", e2.response.get("Error", {}).get("Code", ""), str(e2))
                return _resp(500, {"message": "Server error", "where": "put_me_profile_fallback"})

        # Unknown error → 500
        return _resp(500, {"message": "Server error", "where": "put_me_profile_transact", "code": code})
    except Exception as e:
        _log("put_me_profile unexpected", str(e))
        return _resp(500, {"message": "Server error", "where": "put_me_profile_unhandled"})

def _get_profile_by_handle(handle: str) -> Dict[str, Any]:
    """
    PUBLIC: fetch a wrestler profile by handle via GSI.
    (Return the raw item; lock down at front-end if you want to hide certain fields.)
    """
    if not handle:
        return _resp(400, {"message": "handle required"})
    try:
        r = T_WREST.query(
            IndexName="ByHandle",
            KeyConditionExpression=Key("handle").eq(handle),
            Limit=1,
        )
        items = r.get("Items") or []
        if not items:
            return _resp(404, {"message": "Not found"})
        return _resp(200, items[0])
    except Exception as e:
        _log("get by handle error", e)
        return _resp(500, {"message": "Server error"})

# ---------------- Promoter Profiles & Applications -----------------------------

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

        # Public: GET /profiles/wrestlers/{handle}  (but not /me)
        if method == "GET" and path.startswith("/profiles/wrestlers/") and path != "/profiles/wrestlers/me":
            handle = path.split("/")[-1]
            return _get_profile_by_handle(handle)

        # Auth'd Wrestler: PUT /profiles/wrestlers/me (create/update self + reserve handle)
        if method == "PUT" and path == "/profiles/wrestlers/me":
            sub, groups = _claims(event)
            if not sub:
                return _resp(401, {"message": "Unauthorized"})
            return _put_me_profile(sub, groups, event)

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
                # legacy writer; kept for older clients that still POST here
                return _upsert_wrestler_profile(sub, groups, event)
            if method == "GET":
                # me
                if _is_wrestler(groups):
                    item = T_WREST.get_item(Key={"userId": sub}).get("Item") or {}
                    return _resp(200, item)
                # promoter search
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
