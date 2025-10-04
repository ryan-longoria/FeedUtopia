from __future__ import annotations

import logging
from typing import Any

from boto3.dynamodb.conditions import Attr

from auth import _is_promoter, _is_wrestler
from db.tables import T_PROMO
from http_utils import _now_iso, _qs, _resp
from media import _normalize_media_key

LOGGER = logging.getLogger("wrestleutopia.routes.promoters")


def _upsert_promoter_profile(sub: str, groups: set[str], event) -> dict[str, Any]:
    if not _is_promoter(groups):
        return _resp(403, {"message": "Promoter role required"})

    from http_utils import _json  # local import to avoid circulars

    data = _json(event) or {}

    org = (data.get("orgName") or "").strip()
    address = (data.get("address") or "").strip()
    if not org or not address:
        return _resp(400, {"message": "Missing required fields (orgName, address)"})

    # Load current so we preserve unspecified fields
    existing = T_PROMO.get_item(Key={"userId": sub}).get("Item") or {}

    # Socials (optional, filtered)
    raw_socials = data.get("socials")
    if isinstance(raw_socials, dict):
        allowed = ["twitter", "instagram", "facebook", "tiktok", "youtube", "website"]
        socials = {k: (str(v).strip() or None) for k, v in raw_socials.items() if k in allowed}
        socials = {k: v for k, v in socials.items() if v} or None
    else:
        socials = existing.get("socials") or None

    # Logo (optional)
    raw_logo = (data.get("logoKey") or "").strip()
    if raw_logo:
        logo_key = _normalize_media_key(raw_logo, sub, actor="promoter", kind="logo") or existing.get("logoKey")
    else:
        logo_key = existing.get("logoKey")

    # Gallery photos (optional list replace)
    if isinstance(data.get("mediaKeys"), list):
        media_keys: list[str] = []
        for x in data["mediaKeys"]:
            if isinstance(x, str) and x.strip():
                nk = _normalize_media_key(x, sub, actor="promoter")
                if nk:
                    media_keys.append(nk)
    else:
        media_keys = existing.get("mediaKeys", [])

    # Highlights (optional list replace)
    if isinstance(data.get("highlights"), list):
        highlights = [str(u).strip() for u in data["highlights"] if isinstance(u, str) and u.strip()]
    else:
        highlights = existing.get("highlights", [])

    item = {
        **existing,  # preserve other fields not overwritten below
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
    item.setdefault("createdAt", existing.get("createdAt") or _now_iso())

    T_PROMO.put_item(Item=item)
    return _resp(200, item)


def _get_promoter_profile(sub: str) -> dict[str, Any]:

    item = T_PROMO.get_item(Key={"userId": sub}).get("Item") or {}
    item.setdefault("mediaKeys", [])
    item.setdefault("highlights", [])
    item.setdefault("socials", {})
    return _resp(200, item)


def _get_promoter_public(user_id: str) -> dict[str, Any]:

    item = T_PROMO.get_item(Key={"userId": user_id}).get("Item")
    if not item:
        return _resp(404, {"message": "Not found"})
    item.setdefault("mediaKeys", [])
    item.setdefault("highlights", [])
    item.setdefault("socials", {})
    return _resp(200, item)


def _list_promoters(groups: set[str], event) -> dict[str, Any]:

    if not (_is_wrestler(groups) or _is_promoter(groups)):
        return _resp(403, {"message": "Wrestler or promoter role required"})

    qs = _qs(event)
    city = (qs.get("city") or "").strip()
    q = (qs.get("q") or "").strip()
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

    except Exception as exc:  # noqa: BLE001
        LOGGER.error("promoters_scan_error qs=%s error=%s", qs, exc)
        return _resp(500, {"message": "Server error", "where": "list_promoters"})
