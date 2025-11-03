from __future__ import annotations
import base64
import json
import re
from typing import Any, Dict, Optional, Set

from boto3.dynamodb.conditions import Attr
from botocore.exceptions import BotoCoreError, ClientError

from auth import _is_promoter, _is_wrestler
from db.tables import T_PROMO
from http_utils import _json, _now_iso, _qs, _resp
from media import _normalize_media_key

try:
    from log import get_logger
    _log = get_logger("routes.promoters")
except Exception:
    import logging
    _log = logging.getLogger("wrestleutopia.routes.promoters")

_ALLOWED_SOCIALS = {"twitter", "instagram", "facebook", "tiktok", "youtube", "website"}
_URL_RE = re.compile(r"^https?://", re.IGNORECASE)
_MAX_STR = 2000
_MAX_BIO = 10000
_MAX_ARRAY = 200
_MAX_LIMIT = 100
_DEFAULT_LIMIT = 50


def _safe_str(val: Any, *, max_len: int = _MAX_STR) -> Optional[str]:
    """Normalize a value to a bounded string or None."""
    if val is None:
        return None
    s = str(val).strip()
    if not s:
        return None
    if len(s) > max_len:
        return s[:max_len]
    return s


def _safe_url(val: Any) -> Optional[str]:
    """Return a sanitized http(s) URL or None."""
    s = _safe_str(val)
    if not s:
        return None
    if not _URL_RE.match(s):
        return None
    return s


def _cap_list_str(values: Any, *, max_items: int = _MAX_ARRAY) -> list[str]:
    """Return a deduped, bounded list of non-empty strings."""
    if not isinstance(values, list):
        return []
    out: list[str] = []
    seen = set()
    for v in values:
        s = _safe_str(v)
        if not s or s in seen:
            continue
        out.append(s)
        seen.add(s)
        if len(out) >= max_items:
            break
    return out


def _decode_next_token(token: Optional[str]) -> Optional[Dict[str, Any]]:
    """Base64 JSON decode of the pagination token."""
    if not token:
        return None
    try:
        data = base64.urlsafe_b64decode(token.encode("utf-8"))
        return json.loads(data.decode("utf-8"))
    except Exception:
        return None


def _encode_next_token(lek: Optional[Dict[str, Any]]) -> Optional[str]:
    """Base64 JSON encode of LastEvaluatedKey."""
    if not lek:
        return None
    raw = json.dumps(lek).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8")


def _upsert_promoter_profile(sub: str, groups: Set[str], event) -> Dict[str, Any]:
    """Create or update a promoter profile."""
    if not _is_promoter(groups):
        return _resp(403, {"message": "Promoter role required"})

    data = _json(event) or {}
    org = _safe_str(data.get("orgName"), max_len=256)
    address = _safe_str(data.get("address"), max_len=512)
    if not org:
        return _resp(400, {"message": "Missing required fields (orgName, address)"})

    try:
        existing = T_PROMO.get_item(Key={"userId": sub}).get("Item") or {}
    except (ClientError, BotoCoreError) as exc:
        _log.error("promo_get_item_failed err=%s", exc)
        return _resp(500, {"message": "Server error"})

    socials = existing.get("socials") or None
    raw_socials = data.get("socials")
    if isinstance(raw_socials, dict):
        tmp = {}
        for k, v in raw_socials.items():
            if k in _ALLOWED_SOCIALS:
                url = _safe_url(v)
                if url:
                    tmp[k] = url
        socials = tmp or None

    raw_logo = _safe_str(data.get("logoKey"), max_len=512)
    if raw_logo:
        logo_key = _normalize_media_key(raw_logo, sub, actor="promoter", kind="logo") or existing.get("logoKey")
    else:
        logo_key = existing.get("logoKey")

    if isinstance(data.get("mediaKeys"), list):
        media_keys: list[str] = []
        for x in data["mediaKeys"]:
            nk = _safe_str(x, max_len=1024)
            if nk:
                nk = _normalize_media_key(nk, sub, actor="promoter")
                if nk:
                    media_keys.append(nk)
        seen = set()
        media_keys = [m for m in media_keys if not (m in seen or seen.add(m))]
        media_keys = media_keys[:_MAX_ARRAY]
    else:
        media_keys = existing.get("mediaKeys", [])

    if isinstance(data.get("highlights"), list):
        highlights = _cap_list_str(data["highlights"], max_items=_MAX_ARRAY)
    else:
        highlights = existing.get("highlights", [])

    city = _safe_str(data.get("city"), max_len=128) or existing.get("city") or None
    region = _safe_str(data.get("region"), max_len=128) or existing.get("region") or None
    country = _safe_str(data.get("country"), max_len=128) or existing.get("country") or None
    website = _safe_url(data.get("website")) or existing.get("website") or None
    contact = _safe_str(data.get("contact"), max_len=256) or existing.get("contact") or None
    bio_in = _safe_str(data.get("bio"), max_len=_MAX_BIO)
    bio = bio_in if bio_in is not None else (existing.get("bio") or None)

    item = {
        **existing,
        "userId": sub,
        "role": "Promoter",
        "orgName": org,
        "address": address,
        "city": city,
        "region": region,
        "country": country,
        "website": website,
        "contact": contact,
        "bio": bio,
        "logoKey": logo_key,
        "socials": socials,
        "mediaKeys": media_keys,
        "highlights": highlights,
        "updatedAt": _now_iso(),
    }
    item.setdefault("createdAt", existing.get("createdAt") or _now_iso())

    try:
        T_PROMO.put_item(Item=item)
    except (ClientError, BotoCoreError) as exc:
        _log.error("promo_put_item_failed err=%s", exc)
        return _resp(500, {"message": "Server error"})

    _log.info("promoter_upsert ok user=%s has_logo=%s media_count=%d", sub, bool(logo_key), len(media_keys))
    return _resp(200, item)


def _get_promoter_profile(sub: str) -> Dict[str, Any]:
    """Return the caller's promoter profile (private)."""
    try:
        res = T_PROMO.get_item(
            Key={"userId": sub},
            ProjectionExpression=(
                "userId, #role, orgName, address, city, #r, country, "
                "website, contact, bio, logoKey, socials, mediaKeys, highlights, "
                "createdAt, updatedAt"
            ),
            ExpressionAttributeNames={"#r": "region", "#role": "role"},
        )
        item = res.get("Item") or {}
    except (ClientError, BotoCoreError) as exc:
        _log.error("promo_get_me_failed err=%s", exc)
        return _resp(500, {"message": "Server error"})

    item.setdefault("mediaKeys", [])
    item.setdefault("highlights", [])
    item.setdefault("socials", {})
    return _resp(200, item)


def _get_promoter_public(user_id: str) -> Dict[str, Any]:
    """Return a public (redacted) promoter profile by userId."""
    try:
        res = T_PROMO.get_item(
            Key={"userId": user_id},
            ProjectionExpression=(
                "userId, #role, orgName, city, #r, country, "
                "website, bio, logoKey, socials, mediaKeys, highlights, "
                "createdAt, updatedAt"
            ),
            ExpressionAttributeNames={"#r": "region", "#role": "role"},
        )
        item = res.get("Item")
    except (ClientError, BotoCoreError) as exc:
        _log.error("promo_get_public_failed err=%s", exc)
        return _resp(500, {"message": "Server error"})

    if not item:
        return _resp(404, {"message": "Not found"})

    item.setdefault("mediaKeys", [])
    item.setdefault("highlights", [])
    item.setdefault("socials", {})
    return _resp(200, item)


def _list_promoters(groups: Set[str], event) -> Dict[str, Any]:
    """List promoters with optional filters, pagination, and limits."""
    if not (_is_wrestler(groups) or _is_promoter(groups)):
        return _resp(403, {"message": "Wrestler or promoter role required"})

    qs = _qs(event)
    city = _safe_str(qs.get("city"), max_len=128)
    q = _safe_str(qs.get("q"), max_len=128)
    limit_str = _safe_str(qs.get("limit"))
    next_token = _safe_str(qs.get("next"))
    last_evaluated_key = _decode_next_token(next_token)

    try:
        limit = int(limit_str) if limit_str is not None else _DEFAULT_LIMIT
    except ValueError:
        limit = _DEFAULT_LIMIT
    if limit < 1:
        limit = 1
    if limit > _MAX_LIMIT:
        limit = _MAX_LIMIT

    fe = None
    if city:
        cond = Attr("city").contains(city)
        fe = cond if fe is None else fe & cond
    if q:
        cond = (Attr("orgName").contains(q) | Attr("bio").contains(q))
        fe = cond if fe is None else fe & cond

    try:
        scan_params = {
            "Limit": limit,
            "ProjectionExpression": (
                "userId, #role, orgName, city, #r, country, "
                "website, bio, logoKey, socials, mediaKeys, highlights, "
                "createdAt, updatedAt"
            ),
            "ExpressionAttributeNames": {"#r": "region", "#role": "role"},
        }
        if last_evaluated_key:
            scan_params["ExclusiveStartKey"] = last_evaluated_key
        if fe is not None:
            scan_params["FilterExpression"] = fe
        r = T_PROMO.scan(**scan_params)
        items = r.get("Items", [])
        lek = r.get("LastEvaluatedKey")
        resp = {"items": items, "next": _encode_next_token(lek)}
        return _resp(200, resp)
    except (ClientError, BotoCoreError) as exc:
        _log.error("promoters_scan_error err=%s", exc)
        return _resp(500, {"message": "Server error", "where": "list_promoters"})