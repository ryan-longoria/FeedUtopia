# routes/applications.py
from __future__ import annotations


import logging
from typing import Any

from boto3.dynamodb.conditions import Key

from auth import _is_wrestler
from db.tables import T_APP, T_TRY, T_WREST
from db.wrestlers import _batch_get_wrestlers, _get_wrestler_pk
from http_utils import _resp, _qs

LOGGER = logging.getLogger("wrestleutopia.routes.applications")


def _post_application(sub: str, groups: set[str], event) -> dict[str, Any]:
    if not _is_wrestler(groups):
        return _resp(403, {"message": "Wrestler role required"})

    from http_utils import _json, _now_iso  # local import to avoid circulars

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
                "applicantIdGsi": sub,  # GSI: ByApplicant
                "timestamp": now,
                "notes": (data.get("notes") or "").strip(),
                "reelLink": (data.get("reelLink") or "").strip(),
                "status": "submitted",
            },
            ConditionExpression=(
                "attribute_not_exists(tryoutId) AND attribute_not_exists(applicantId)"
            ),  # one app per wrestler per tryout
        )
    except Exception as exc:  # noqa: BLE001
        # Duplicate (ConditionalCheckFailed) → treat as idempotent success.
        code = (
            getattr(getattr(exc, "response", {}), "get", lambda *_: {})("Error", {}).get("Code")
            if hasattr(exc, "response")
            else ""
        )
        LOGGER.info("post_application_put_item exception=%s code=%s", exc, code)
        return _resp(200, {"ok": True, "tryoutId": tryout_id, "note": "already_applied"})

    return _resp(200, {"ok": True, "tryoutId": tryout_id})


def _get_applications(sub: str, event) -> dict[str, Any]:
    qs = _qs(event)

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

        # Enrich with lightweight wrestler profile snippets
        if apps:
            ids = sorted({a.get("applicantId") for a in apps if a.get("applicantId")})
            profiles: dict[str, dict] = {}

            if ids:
                proj = "userId, handle, stageName, #n, city, #r, photoKey"
                ean = {"#r": "region", "#n": "name"}

                # 1) BatchGet using 2-key AV maps; deserialize with cfg.deserializer
                try:
                    av_items = _batch_get_wrestlers(ids, proj, ean)
                    for av in av_items:
                        from config import get_config
                        p = {k: get_config().deserializer.deserialize(v) for k, v in av.items()}
                        p["stageName"] = p.get("stageName") or p.get("name") or None
                        uid = p.get("userId")
                        if uid:
                            profiles[uid] = p
                except Exception as exc:  # noqa: BLE001
                    LOGGER.info("batch_get_profiles_failed error=%s", exc)

                # 2) Fallback GetItem per id with the correct key shape
                pk = _get_wrestler_pk()
                for uid in ids:
                    if uid in profiles:
                        continue
                    key = {"userId": uid}
                    if len(pk) == 2 and "role" in pk:
                        key["role"] = "Wrestler"
                    try:
                        gi = T_WREST.get_item(
                            Key=key, ProjectionExpression=proj, ExpressionAttributeNames=ean
                        )
                        it = gi.get("Item")
                        if it:
                            it["stageName"] = it.get("stageName") or it.get("name") or None
                            profiles[uid] = it
                    except Exception as exc:  # noqa: BLE001
                        LOGGER.info("get_item_profile_fallback_failed uid=%s err=%s", uid, exc)

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
