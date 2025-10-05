from __future__ import annotations

import base64
import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

from auth import _is_promoter, _is_wrestler
from config import HANDLE_RE, get_config
from db.tables import T_HANDLES, T_WREST
from http_utils import _json, _now_iso, _qs, _resp
from media import _normalize_media_key

CFG = get_config()
LOG = logging.getLogger("wrestleutopia.routes.wrestlers")


def _slugify_handle(stage_name: str) -> Optional[str]:
    """Convert a stage name into a lowercase, hyphenated handle."""
    s = (stage_name or "").strip().lower()
    s = HANDLE_RE.sub("-", s).strip("-")
    return s or None


def _safe_cursor_encode(key: Optional[Dict[str, Any]]) -> Optional[str]:
    """Encode a Dynamo LastEvaluatedKey into an opaque cursor string."""
    if not key:
        return None
    try:
        raw = json.dumps(key, separators=(",", ":"), ensure_ascii=False)
        return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")
    except Exception:
        return None


def _safe_cursor_decode(cursor: Optional[str]) -> Optional[Dict[str, Any]]:
    """Decode an opaque cursor back into a Dynamo LastEvaluatedKey."""
    if not cursor:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        key = json.loads(raw)
        if isinstance(key, dict):
            return key
    except Exception:
        return None
    return None


def _bounded_limit(qs: Dict[str, str], *, default: int = 50, min_v: int = 10, max_v: int = 100) -> int:
    """Parse and bound a 'limit' query parameter for scans/queries."""
    val = (qs.get("limit") or "").strip()
    if not val:
        return default
    try:
        i = int(val)
    except ValueError:
        return default
    return max(min_v, min(max_v, i))


def _projection_for_promoter_list() -> Tuple[str, Dict[str, str]]:
    """Return a projection expression to minimize data returned to promoters."""
    fields = [
        "userId", "handle", "stageName", "name",
        "city", "#r", "country", "photoKey",
        "gimmicks", "experienceYears",
    ]
    ean = {"#r": "region"}
    proj = ", ".join(fields)
    return proj, ean


def _upsert_wrestler_profile(sub: str, groups: set[str], event) -> dict[str, Any]:
    """Legacy upsert for wrestler profiles (kept for backwards compatibility)."""
    if not _is_wrestler(groups):
        return _resp(403, {"message": "Wrestler role required"})
    data = _json(event) or {}
    data["userId"] = sub
    existing = T_WREST.get_item(Key={"userId": sub}).get("Item") or {}
    merged = {**existing, **data}
    if "mediaKeys" not in merged or not isinstance(merged["mediaKeys"], list):
        merged["mediaKeys"] = existing.get("mediaKeys", [])
    if "highlights" not in merged or not isinstance(merged["highlights"], list):
        merged["highlights"] = existing.get("highlights", [])
    merged.setdefault("role", "Wrestler")
    merged.setdefault("createdAt", existing.get("createdAt") or _now_iso())
    merged["updatedAt"] = _now_iso()
    T_WREST.put_item(Item=merged)
    return _resp(200, {"ok": True, "userId": sub})


def _list_wrestlers(groups: set[str], event) -> dict[str, Any]:
    """List wrestlers for promoters with optional filters."""
    if not _is_promoter(groups):
        return _resp(403, {"message": "Promoter role required to view wrestler profiles"})
    qs = _qs(event)
    style = (qs.get("style") or "").strip()
    city = (qs.get("city") or "").strip()
    verified = (qs.get("verified") or "").strip().lower()
    limit = _bounded_limit(qs)
    start_key = _safe_cursor_decode(qs.get("cursor"))
    fe = None
    try:
        if style:
            cond = Attr("gimmicks").contains(style)
            fe = cond if fe is None else fe & cond
        if city:
            cond = Attr("city").contains(city)
            fe = cond if fe is None else fe & cond
        if verified in {"true", "1", "yes"}:
            cond = Attr("verified_school").eq(True)
            fe = cond if fe is None else fe & cond
        proj, ean = _projection_for_promoter_list()
        scan_kwargs = {
            "Limit": limit,
            "ProjectionExpression": proj,
            "ExpressionAttributeNames": ean,
        }
        if start_key:
            scan_kwargs["ExclusiveStartKey"] = start_key
        if fe is not None:
            scan_kwargs["FilterExpression"] = fe

        r = T_WREST.scan(**scan_kwargs)
        items = r.get("Items", [])
        next_key = r.get("LastEvaluatedKey")
        cursor = _safe_cursor_encode(next_key)
        return _resp(200, {"items": items, "cursor": cursor})
    except Exception as exc:
        LOG.error("wrestlers_scan_error err=%s", exc)
        return _resp(500, {"message": "Server error", "where": "list_wrestlers"})


def _put_me_profile(sub: str, groups: set[str], event) -> dict[str, Any]:
    """Create or update the caller's wrestler profile with validation and limits."""
    if not _is_wrestler(groups):
        return _resp(403, {"message": "Wrestler role required"})
    data = _json(event)
    stage = (data.get("stageName") or "").strip()
    first = (data.get("firstName") or "").strip()
    last = (data.get("lastName") or "").strip()
    dob = (data.get("dob") or "").strip()
    city = (data.get("city") or "").strip()
    region = (data.get("region") or "").strip()
    country = (data.get("country") or "").strip()
    height_in = data.get("heightIn")
    weight_lb = data.get("weightLb")
    missing: List[str] = []
    if not stage:
        missing.append("stageName")
    if not first:
        missing.append("firstName")
    if not last:
        missing.append("lastName")
    if not dob or not re.match(r"^\d{4}-\d{2}-\d{2}$", dob):
        missing.append("dob (YYYY-MM-DD)")
    if not city:
        missing.append("city")
    if not region:
        missing.append("state/region")
    if not country:
        missing.append("country")
    try:
        height_in = int(height_in)
    except Exception:
        height_in = None
    try:
        weight_lb = int(weight_lb)
    except Exception:
        weight_lb = None
    if height_in is None:
        missing.append("heightIn (inches)")
    if weight_lb is None:
        missing.append("weightLb (lbs)")
    if missing:
        return _resp(400, {"message": "Missing/invalid required fields", "fields": missing})
    middle = (data.get("middleName") or "").strip() or None
    bio = (data.get("bio") or "").strip() or None
    if bio and len(bio) > CFG.max_bio_len:
        return _resp(400, {"message": f"bio too long (max {CFG.max_bio_len})"})
    gimmicks = data.get("gimmicks") or []
    if isinstance(gimmicks, str):
        gimmicks = [x.strip() for x in gimmicks.split(",") if x.strip()]
    gimmicks = list(dict.fromkeys(gimmicks))[: CFG.max_gimmicks] or None
    socials = data.get("socials") or {}
    if not isinstance(socials, dict):
        socials = {}
    allowed = ["twitter", "instagram", "tiktok", "youtube", "facebook", "website"]
    socials = {k: (str(v).strip() or None) for k, v in socials.items() if k in allowed}
    socials = {k: v for k, v in socials.items() if v} or None
    exp_years = data.get("experienceYears")
    try:
        exp_years = int(exp_years) if exp_years is not None and str(exp_years).strip() != "" else None
    except Exception:
        exp_years = None
    achievements = (data.get("achievements") or "").strip() or None
    existing = T_WREST.get_item(Key={"userId": sub}).get("Item") or {}
    current_handle = (existing.get("handle") or "").strip() or None
    raw_key = (data.get("photoKey") or "").strip()
    norm_key = (
        _normalize_media_key(raw_key, sub, actor="wrestler", kind="avatar")
        if raw_key
        else existing.get("photoKey") or None
    )
    now = _now_iso()
    base_profile = {
        "userId": sub,
        "role": "Wrestler",
        "updatedAt": now,
        "createdAt": existing.get("createdAt") or now,
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
        "bio": bio,
        "gimmicks": gimmicks,
        "socials": socials,
        "experienceYears": exp_years,
        "achievements": achievements,
        "name": f"{first} {last}",
        "photoKey": norm_key,
    }
    incoming_media = data.get("mediaKeys")
    if isinstance(incoming_media, list):
        media_keys: List[str] = []
        for x in incoming_media:
            if isinstance(x, str) and x.strip():
                nk = _normalize_media_key(x, sub, actor="wrestler")
                if nk:
                    media_keys.append(nk)
    else:
        media_keys = existing.get("mediaKeys", [])
    incoming_highlights = data.get("highlights")
    if isinstance(incoming_highlights, list):
        highlights_arr = [str(x) for x in incoming_highlights if isinstance(x, str) and x.strip()]
    else:
        highlights_arr = existing.get("highlights", [])
    pk = base_profile.get("photoKey") or ""
    if pk and pk not in media_keys:
        if pk.startswith(("public/wrestlers/gallery/", "public/wrestlers/images/")):
            media_keys = [pk] + media_keys
    item_out = {
        **existing,
        **base_profile,
        "mediaKeys": media_keys,
        "highlights": highlights_arr,
    }

    def _reserve_handle(owner: str, h: str) -> bool:
        """Reserve a handle idempotently for an owner."""
        try:
            T_HANDLES.put_item(
                Item={"handle": h, "owner": owner},
                ConditionExpression="attribute_not_exists(handle) OR #owner = :u",
                ExpressionAttributeNames={"#owner": "owner"},
                ExpressionAttributeValues={":u": owner},
            )
            return True
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code")
            if code in ("ConditionalCheckFailedException", "TransactionCanceledException"):
                return False
            raise

    def _pick_unique_handle(base: str, owner: str) -> str:
        """Pick a unique handle by trying base, then fallbacks."""
        base_slug = _slugify_handle(base) or "wrestler"
        for i in range(0, 50):
            h = base_slug if i == 0 else f"{base_slug}-{i + 1}"
            if _reserve_handle(owner, h):
                return h
        fallback = f"u-{owner[:8].lower()}"
        if _reserve_handle(owner, fallback):
            return fallback
        import random
        import string
        for _ in range(20):
            rnd = "".join(random.choice(string.ascii_lowercase + string.digits) for _ in range(4))
            h = f"{fallback}-{rnd}"
            if _reserve_handle(owner, h):
                return h
        return fallback

    if current_handle:
        item_out["handle"] = current_handle
    else:
        desired = _slugify_handle(stage) or "wrestler"
        item_out["handle"] = _pick_unique_handle(desired, sub)
    T_WREST.put_item(Item=item_out)
    return _resp(200, item_out)


def _get_profile_by_handle(handle: str) -> dict[str, Any]:
    """Fetch a wrestler profile by handle using GSI 'ByHandle'."""
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
    except Exception as exc:
        LOG.error("get_by_handle_error err=%s", exc)
        return _resp(500, {"message": "Server error"})