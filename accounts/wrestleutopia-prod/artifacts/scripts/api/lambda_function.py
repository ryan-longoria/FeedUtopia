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
from boto3.dynamodb.types import TypeSerializer, TypeDeserializer

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
DES = TypeDeserializer()

TABLE_WRESTLERS_DESC = ddb.meta.client.describe_table(TableName=TABLE_WRESTLERS)
WRES_PK = [k["AttributeName"] for k in TABLE_WRESTLERS_DESC["Table"]["KeySchema"]]

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

def _key_map_for_user(user_id: str) -> dict:
    km = {"userId": {"S": user_id}}
    if len(WRES_PK) == 2 and "role" in WRES_PK:
        km["role"] = {"S": "Wrestler"}
    return km

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
    slots = int(data.get("slots") or 0)
    if slots < 0: slots = 0
    if slots > 10000: slots = 10000

    if status_in not in {"open","closed","filled"}:
        status_in = "open"
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
    data = _json(event) or {}
    data["userId"] = sub

    # Load existing and merge so we never drop fields that weren't sent
    existing = T_WREST.get_item(Key={"userId": sub}).get("Item") or {}
    merged = {**existing, **data}

    # normalize expected fields
    if "mediaKeys" not in merged or not isinstance(merged["mediaKeys"], list):
        merged["mediaKeys"] = existing.get("mediaKeys", [])
    if "highlights" not in merged or not isinstance(merged["highlights"], list):
        merged["highlights"] = existing.get("highlights", [])

    merged.setdefault("role", "Wrestler")
    merged.setdefault("createdAt", existing.get("createdAt") or _now_iso())
    merged["updatedAt"] = _now_iso()

    T_WREST.put_item(Item=merged)
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
    
def _normalize_photo_key(raw: str, sub: str) -> str | None:
    if not raw:
        return None
    k = raw.strip()

    # If it's an s3:// URL, drop the scheme and bucket → keep only the key
    if k.startswith("s3://"):
        # s3://bucket/key...
        parts = k.split("/", 3)
        if len(parts) >= 4:
            k = parts[3]  # key after bucket/
        else:
            return None

    # If it already starts with user/, keep it
    if k.startswith("user/"):
        return k

    # If it starts with {sub}/..., prefix user/
    if sub and k.startswith(f"{sub}/"):
        return f"user/{k}"

    # Otherwise fall back to user/{sub}/{filename}
    fname = k.split("/")[-1]
    if not sub:
        return None
    return f"user/{sub}/{fname}"

def _put_me_profile(sub: str, groups: Set[str], event: Dict[str, Any]) -> Dict[str, Any]:
    if not _is_wrestler(groups):
        return _resp(403, {"message": "Wrestler role required"})

    data = _json(event)

    # -------- REQUIRED --------
    stage     = (data.get("stageName") or "").strip()
    first     = (data.get("firstName") or "").strip()
    last      = (data.get("lastName") or "").strip()
    dob       = (data.get("dob") or "").strip()           # YYYY-MM-DD
    city      = (data.get("city") or "").strip()
    region    = (data.get("region") or "").strip()        # state
    country   = (data.get("country") or "").strip()
    height_in = data.get("heightIn")
    weight_lb = data.get("weightLb")

    missing = []
    if not stage:   missing.append("stageName")
    if not first:   missing.append("firstName")
    if not last:    missing.append("lastName")
    if not dob or not re.match(r"^\d{4}-\d{2}-\d{2}$", dob): missing.append("dob (YYYY-MM-DD)")
    if not city:    missing.append("city")
    if not region:  missing.append("state/region")
    if not country: missing.append("country")
    try:
        height_in = int(height_in)
    except Exception:
        height_in = None
    try:
        weight_lb = int(weight_lb)
    except Exception:
        weight_lb = None
    if height_in is None: missing.append("heightIn (inches)")
    if weight_lb is None: missing.append("weightLb (lbs)")

    if missing:
        return _resp(400, {"message": "Missing/invalid required fields", "fields": missing})

    # -------- OPTIONAL --------
    middle    = (data.get("middleName") or "").strip() or None
    bio       = (data.get("bio") or "").strip() or None
    if bio and len(bio) > MAX_BIO_LEN:
        return _resp(400, {"message": f"bio too long (max {MAX_BIO_LEN})"})

    # gimmicks: normalize to unique list (max 10)
    gimmicks = data.get("gimmicks") or []
    if isinstance(gimmicks, str):
        gimmicks = [x.strip() for x in gimmicks.split(",") if x.strip()]
    gimmicks = list(dict.fromkeys(gimmicks))[:MAX_GIMMICKS] or None

    # socials: simple map of site->url
    socials = data.get("socials") or {}
    if not isinstance(socials, dict):
        socials = {}
    allowed = ["twitter","instagram","tiktok","youtube","facebook","website"]
    socials = {k: (str(v).strip() or None) for k,v in socials.items() if k in allowed}
    socials = {k:v for k,v in socials.items() if v} or None

    # experience & achievements
    exp_years = data.get("experienceYears")
    try:
        exp_years = int(exp_years) if exp_years is not None and str(exp_years).strip() != "" else None
    except Exception:
        exp_years = None
    achievements = (data.get("achievements") or "").strip() or None

    # Load current to keep handle if present
    existing = T_WREST.get_item(Key={"userId": sub}).get("Item") or {}
    current_handle = (existing.get("handle") or "").strip() or None

    raw_key = (data.get("photoKey") or "").strip()
    norm_key = _normalize_photo_key(raw_key, sub) if raw_key else (existing.get("photoKey") or None)

    now = _now_iso()
    # Base (non-array) profile fields
    base_profile = {
        "userId": sub,
        "role": "Wrestler",
        "updatedAt": now,
        "createdAt": existing.get("createdAt") or now,

        # NEW canonical fields
        "stageName": stage,
        "firstName": first,
        "middleName": middle,
        "lastName": last,
        "dob": dob,
        "city": city,
        "region": region,
        "country": country,
        "heightIn": height_in,
        "weightLb": weight_lb,

        # Optional/extended
        "bio": bio,
        "gimmicks": gimmicks,
        "socials": socials,
        "experienceYears": exp_years,
        "achievements": achievements,

        # Legacy convenience (keep if you already use 'name' elsewhere)
        "name": f"{first} {last}",
        "photoKey": norm_key,
    }

    # --- Persist gallery arrays ---
    incoming_media = data.get("mediaKeys")
    if isinstance(incoming_media, list):
        media_keys = [str(x) for x in incoming_media if isinstance(x, str) and x.strip()]
    else:
        media_keys = existing.get("mediaKeys", [])

    incoming_highlights = data.get("highlights")
    if isinstance(incoming_highlights, list):
        highlights_arr = [str(x) for x in incoming_highlights if isinstance(x, str) and x.strip()]
    else:
        highlights_arr = existing.get("highlights", [])

    # If photoKey exists but not in mediaKeys, add it to the front (optional)
    if base_profile.get("photoKey") and base_profile["photoKey"] not in media_keys:
        media_keys = [base_profile["photoKey"]] + media_keys

    # Build final item
    item_out = {
        **existing,
        **base_profile,
        "mediaKeys": media_keys,
        "highlights": highlights_arr,
    }

    # Handle reservation helpers (unchanged from your version)
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

    def _pick_unique_handle(base: str, owner: str) -> str:
        base_slug = _slugify_handle(base) or "wrestler"
        for i in range(0, 50):
            h = base_slug if i == 0 else f"{base_slug}-{i+1}"
            if _reserve_handle(owner, h):
                return h
        fallback = f"u-{owner[:8].lower()}"
        if _reserve_handle(owner, fallback):
            return fallback
        import random, string
        for _ in range(20):
            rnd = ''.join(random.choice(string.ascii_lowercase + string.digits) for _ in range(4))
            h = f"{fallback}-{rnd}"
            if _reserve_handle(owner, h):
                return h
        return fallback

    # Keep or allocate handle
    if current_handle:
        item_out["handle"] = current_handle
    else:
        desired = _slugify_handle(stage) or "wrestler"
        item_out["handle"] = _pick_unique_handle(desired, sub)

    T_WREST.put_item(Item=item_out)
    return _resp(200, item_out)


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
        item = items[0]
        item.setdefault("mediaKeys", [])
        item.setdefault("highlights", [])
        return _resp(200, item)
    except Exception as e:
        _log("get by handle error", e)
        return _resp(500, {"message": "Server error"})

# ---------------- Promoter Profiles & Applications -----------------------------

def _upsert_promoter_profile(sub: str, groups: Set[str], event: Dict[str, Any]) -> Dict[str, Any]:
    if not _is_promoter(groups):
        return _resp(403, {"message": "Promoter role required"})
    data = _json(event) or {}

    org = (data.get("orgName") or "").strip()
    address = (data.get("address") or "").strip()
    if not org or not address:
        return _resp(400, {"message": "Missing required fields (orgName, address)"})

    # Load current so we can preserve anything the user didn't send this time
    existing = T_PROMO.get_item(Key={"userId": sub}).get("Item") or {}

    # --- socials (optional, filtered) ---
    raw_socials = data.get("socials")
    socials = None
    if isinstance(raw_socials, dict):
        allowed = ["twitter", "instagram", "facebook", "tiktok", "youtube", "website"]
        socials = {k: (str(v).strip() or None) for k, v in raw_socials.items() if k in allowed}
        socials = {k: v for k, v in socials.items() if v} or None
    else:
        socials = existing.get("socials") or None

    # --- logo: only update if provided; otherwise keep existing ---
    raw_logo = (data.get("logoKey") or "").strip()
    if raw_logo:
        logo_key = _normalize_photo_key(raw_logo, sub) or existing.get("logoKey")
    else:
        logo_key = existing.get("logoKey")

    # --- gallery photos: only replace if client sent a list ---
    if isinstance(data.get("mediaKeys"), list):
        media_keys = []
        for x in data["mediaKeys"]:
            if isinstance(x, str) and x.strip():
                nk = _normalize_photo_key(x, sub)
                if nk:
                    media_keys.append(nk)
    else:
        media_keys = existing.get("mediaKeys", [])

    # --- highlights: only replace if client sent a list ---
    if isinstance(data.get("highlights"), list):
        highlights = [str(u).strip() for u in data["highlights"] if isinstance(u, str) and u.strip()]
    else:
        highlights = existing.get("highlights", [])

    item = {
        **existing,  # start from existing to preserve anything else
        "userId": sub,
        "role": "Promoter",
        "orgName": org,
        "address": address,
        "city": (data.get("city") or "").strip() or existing.get("city") or None,
        "region": (data.get("region") or "").strip() or existing.get("region") or None,
        "country": (data.get("country") or "").strip() or existing.get("country") or None,
        "website": (data.get("website") or "").strip() or existing.get("website") or None,
        "contact": (data.get("contact") or "").strip() or existing.get("contact") or None,
        "bio": (data.get("bio") or "").strip() or existing.get("bio") or None,
        "logoKey": logo_key,
        "socials": socials,
        "mediaKeys": media_keys,
        "highlights": highlights,
        "updatedAt": _now_iso(),
    }
    # keep createdAt if it existed
    item.setdefault("createdAt", existing.get("createdAt") or _now_iso())

    T_PROMO.put_item(Item=item)
    return _resp(200, item)


def _get_open_tryouts_by_owner(owner_id: str) -> Dict[str, Any]:
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

def _get_promoter_profile(sub: str) -> Dict[str, Any]:
    item = T_PROMO.get_item(Key={"userId": sub}).get("Item") or {}
    item.setdefault("mediaKeys", [])
    item.setdefault("highlights", [])
    item.setdefault("socials", {})
    return _resp(200, item)


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

        # Only the owner can list applications for a tryout
        tr = T_TRY.get_item(Key={"tryoutId": tryout_id}).get("Item")
        if not tr:
            return _resp(404, {"message": "Tryout not found"})
        if tr.get("ownerId") != sub:
            return _resp(403, {"message": "Not your tryout"})

        # Fetch applications
        r = T_APP.query(
            KeyConditionExpression=Key("tryoutId").eq(tryout_id),
            Limit=200,
        )
        apps = r.get("Items", [])

        # ---- Enrich with wrestler profile snippets (single BatchGet) ----
        # ---- Enrich with wrestler profile snippets (single BatchGet) ----
        if apps:
            ids = sorted({a.get("applicantId") for a in apps if a.get("applicantId")})
            profiles: dict[str, dict] = {}

            if ids:
                proj = "userId, handle, stageName, #n, city, #r, photoKey"
                ean  = {"#r": "region", "#n": "name"}
                try:
                    req = {
                        TABLE_WRESTLERS: {
                            "Keys": [_key_map_for_user(uid) for uid in ids],
                            "ProjectionExpression": proj,
                            "ExpressionAttributeNames": ean,
                            "ConsistentRead": False,
                        }
                    }
                    client = ddb.meta.client
                    resp   = client.batch_get_item(RequestItems=req)
                    items  = resp.get("Responses", {}).get(TABLE_WRESTLERS, [])

                    # Retry unprocessed keys a few times
                    retries = 0
                    while resp.get("UnprocessedKeys") and retries < 3:
                        resp = client.batch_get_item(RequestItems=resp["UnprocessedKeys"])
                        items += resp.get("Responses", {}).get(TABLE_WRESTLERS, [])
                        retries += 1

                    # Decode AttributeValue maps properly
                    for av in items:
                        p = {k: DES.deserialize(v) for k, v in av.items()}
                        # Normalize stageName fallback for older rows
                        p["stageName"] = p.get("stageName") or p.get("name") or None
                        uid = p.get("userId")
                        if uid:
                            profiles[uid] = p

                except Exception as e:
                    _log("batch_get_item profiles failed", e)

            # Attach (even if profiles is empty, we keep returning apps)
            for a in apps:
                uid = a.get("applicantId")
                a["applicantProfile"] = profiles.get(uid, {})

        return _resp(200, apps)

    # Wrestler: list own apps
    r = T_APP.query(
        IndexName="ByApplicant",
        KeyConditionExpression=Key("applicantIdGsi").eq(sub),
        Limit=200,
    )
    return _resp(200, r.get("Items", []))


def _get_promoter_public(user_id: str) -> Dict[str, Any]:
    item = T_PROMO.get_item(Key={"userId": user_id}).get("Item")
    if not item:
        return _resp(404, {"message": "Not found"})
    item.setdefault("mediaKeys", [])
    item.setdefault("highlights", [])
    item.setdefault("socials", {})
    return _resp(200, item)

def _list_promoters(groups: Set[str], event: Dict[str, Any]) -> Dict[str, Any]:
    # Allow Wrestlers (and optionally Promoters) to search orgs
    if not (_is_wrestler(groups) or _is_promoter(groups)):
        return _resp(403, {"message": "Wrestler or promoter role required"})

    qs = _qs(event)
    city = (qs.get("city") or "").strip()
    q    = (qs.get("q") or "").strip()      # orgName or bio
    limit = 100

    fe = None
    try:
        if city:
            cond = Attr("city").contains(city)
            fe = cond if fe is None else fe & cond
        if q:
            cond = (Attr("orgName").contains(q) | Attr("bio").contains(q))
            fe = cond if fe is None else fe & cond

        r = T_PROMO.scan(FilterExpression=fe, Limit=limit) if fe is not None else T_PROMO.scan(Limit=limit)
        return _resp(200, r.get("Items", []))
    except Exception as e:
        _log("promoters scan error", e, "qs=", qs)
        return _resp(500, {"message": "Server error", "where": "list_promoters"})

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
        
        if method == "GET" and path.startswith("/profiles/promoters/") and path != "/profiles/promoters/me":
            user_id = path.split("/")[-1]
            return _get_promoter_public(user_id)
        
        if method == "GET" and path.startswith("/promoters/") and path.endswith("/tryouts"):
            user_id = path.split("/")[2]  # /promoters/{userId}/tryouts
            return _get_open_tryouts_by_owner(user_id)

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
                    item.setdefault("mediaKeys", [])
                    item.setdefault("highlights", [])
                    return _resp(200, item)
                # promoter search
                if _is_promoter(groups):
                    return _list_wrestlers(groups, event)

        # Auth'd: GET /profiles/promoters/me  (your own promoter profile)
        if method == "GET" and path == "/profiles/promoters/me":
            sub, groups = _claims(event)
            if not sub:
                return _resp(401, {"message": "Unauthorized"})
            return _get_promoter_profile(sub)

        # Auth'd: GET /profiles/promoters  (list/search for wrestlers)
        if method == "GET" and path == "/profiles/promoters":
            sub, groups = _claims(event)
            if not sub:
                return _resp(401, {"message": "Unauthorized"})
            return _list_promoters(groups, event)

        # Auth'd: PUT/POST/PATCH /profiles/promoters (upsert mine)
        if path.startswith("/profiles/promoters") and method in ("PUT","POST","PATCH"):
            sub, groups = _claims(event)
            if not sub:
                return _resp(401, {"message": "Unauthorized"})
            return _upsert_promoter_profile(sub, groups, event)

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
