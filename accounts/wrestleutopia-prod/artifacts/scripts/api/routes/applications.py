from __future__ import annotations

"""
Applications routes: submit and list applications.

Security/SRE notes:
- Uses batch_get_wrestlers(...) with allowlisted fields (no over-fetch).
- Caches TypeDeserializer once (no repeated imports).
- Handles duplicate PutItem via ClientError code.
- Avoids logging PII; logs only counts/ids presence.
"""

import logging
from typing import Any

from botocore.exceptions import ClientError
from boto3.dynamodb.conditions import Key

from .auth import _is_wrestler
from .config import get_config
from .db.tables import T_APP, T_TRY, T_WREST
from .db.wrestlers import batch_get_wrestlers, get_wrestler_pk
from .http import _resp, _qs

LOGGER = logging.getLogger("wrestleutopia.routes.applications")


def _post_application(sub: str, groups: set[str], event) -> dict[str, Any]:
    """Submit a tryout application; idempotent on duplicate."""
    if not _is_wrestler(groups):
        return _resp(403, {"message": "Wrestler role required"})

    from .http import _json, _now_iso  # local import to avoid circulars

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
                "applicantIdGsi": sub,   # GSI: ByApplicant
                "timestamp": now,
                "notes": (data.get("notes") or "").strip(),
                "reelLink": (data.get("reelLink") or "").strip(),
                "status": "submitted",
            },
            ConditionExpression=(
                "attribute_not_exists(tryoutId) AND attribute_not_exists(applicantId)"
            ),  # one app per wrestler per tryout
        )
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code")
        if code == "ConditionalCheckFailedException":
            # Idempotent duplicate: treat as success
            LOGGER.info("application_duplicate tryout=%s", tryout_id)
            return _resp(200, {"ok": True, "tryoutId": tryout_id, "note": "already_applied"})
        LOGGER.error("application_put_failed tryout=%s code=%s", tryout_id, code)
        return _resp(500, {"message": "Server error"})

    return _resp(200, {"ok": True, "tryoutId": tryout_id})


def _get_applications(sub: str, event) -> dict[str, Any]:
    """List applications; promoter-owner view or wrestler self view."""
    qs = _qs(event)
    cfg = get_config()
    des = cfg.deserializer  # cache once

    # Promoter owner view: /applications?tryoutId=...
    if "tryoutId" in qs:
        tryout_id = qs["tryoutId"]

        tr = T_TRY.get_item(Key={"tryoutId": tryout_id}).get("Item")
        if not tr:
            return _resp(404, {"message": "Tryout not found"})
        if tr.get("ownerId") != sub:
            return _resp(403, {"message": "Not your tryout"})

        r = T_APP.query(KeyConditionExpression=Key("tryoutId").eq(tryout_id), Limit=200)
        apps = r.get("Items", [])

        if apps:
            # Unique list of applicant userIds
            ids = sorted({a.get("applicantId") for a in apps if a.get("applicantId")})
            profiles: dict[str, dict] = {}

            if ids:
                # 1) Fast path: batch_get_wrestlers with a safe allowlist
                try:
                    av_items = batch_get_wrestlers(
                        ids=ids,
                        allowed_fields={
                            "userId", "handle", "stageName", "name", "city", "region", "photoKey"
                        },
                        consistent_read=False,
                    )
                    for av in av_items:
                        p = {k: des.deserialize(v) for k, v in av.items()}
                        # Maintain stageName for older profiles
                        p["stageName"] = p.get("stageName") or p.get("name") or None
                        uid = p.get("userId")
                        if uid:
                            profiles[uid] = p
                except Exception as exc:  # noqa: BLE001
                    # Non-fatal: we will try per-id fallback next
                    LOGGER.info("batch_get_profiles_failed error=%s", exc)

                # 2) Fallback: GetItem per id with correct key shape
                if ids:
                    pk = get_wrestler_pk()  # ["userId"] or ["userId","role"]
                    for uid in ids:
                        if uid in profiles:
                            continue
                        key = {"userId": uid}
                        if len(pk) == 2 and "role" in pk:
                            key["role"] = "Wrestler"
                        try:
                            gi = T_WREST.get_item(
                                Key=key,
                                ProjectionExpression=(
                                    "userId, handle, stageName, #n, city, #r, photoKey"
                                ),
                                ExpressionAttributeNames={"#r": "region", "#n": "name"},
                            )
                            it = gi.get("Item")
                            if it:
                                it["stageName"] = it.get("stageName") or it.get("name") or None
                                profiles[uid] = it
                        except Exception as exc:  # noqa: BLE001
                            LOGGER.info("get_item_profile_fallback_failed uid=%s err=%s", uid, exc)

            # Attach enriched profiles (or empty dict if not found)
            for a in apps:
                uid = a.get("applicantId")
                a["applicantProfile"] = profiles.get(uid, {})

        return _resp(200, apps)

    # Wrestler self view: list own applications via GSI
    r = T_APP.query(
        IndexName="ByApplicant",
        KeyConditionExpression=Key("applicantIdGsi").eq(sub),
        Limit=200,
    )
    return _resp(200, r.get("Items", []))