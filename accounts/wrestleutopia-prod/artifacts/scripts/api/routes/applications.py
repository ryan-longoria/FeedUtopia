from boto3.dynamodb.conditions import Key
from ..http import _resp, _qs, _log
from ..auth import _is_wrestler
from ..db.tables import T_APP, T_TRY, T_WREST
from ..db.wrestlers import _batch_get_wrestlers, _get_wrestler_pk
from ..config import DES
from botocore.exceptions import ClientError

def _post_application(sub: str, groups: set[str], event):
    if not _is_wrestler(groups):
        return _resp(403, {"message": "Wrestler role required"})
    from ..http import _json, _now_iso
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
            ConditionExpression=(
                "attribute_not_exists(tryoutId) AND attribute_not_exists(applicantId)"
            ),
        )
    except Exception as e:
        code = getattr(getattr(e, "response", {}), "get", lambda *_: {})("Error", {}).get("Code") if hasattr(e, "response") else ""
        _log("post_application put_item exception", e, "code", code)
        return _resp(200, {"ok": True, "tryoutId": tryout_id, "note": "already_applied"})
    return _resp(200, {"ok": True, "tryoutId": tryout_id})

def _get_applications(sub: str, event):
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
        apps = r.get("Items", [])
        if apps:
            ids = sorted({a.get("applicantId") for a in apps if a.get("applicantId")})
            profiles: dict[str, dict] = {}
            if ids:
                proj = "userId, handle, stageName, #n, city, #r, photoKey"
                ean  = {"#r": "region", "#n": "name"}
                try:
                    av_items = _batch_get_wrestlers(ids, proj, ean)
                    for av in av_items:
                        p = {k: DES.deserialize(v) for k, v in av.items()}
                        p["stageName"] = p.get("stageName") or p.get("name") or None
                        uid = p.get("userId")
                        if uid:
                            profiles[uid] = p
                except Exception as e:
                    _log("batch_get_item profiles failed", e)
                pk = _get_wrestler_pk()
                for uid in ids:
                    if uid in profiles:
                        continue
                    key = {"userId": uid}
                    if len(pk) == 2 and "role" in pk:
                        key["role"] = "Wrestler"
                    try:
                        gi = T_WREST.get_item(Key=key, ProjectionExpression=proj, ExpressionAttributeNames=ean)
                        it = gi.get("Item")
                        if it:
                            it["stageName"] = it.get("stageName") or it.get("name") or None
                            profiles[uid] = it
                    except Exception as e:
                        _log("get_item fallback failed", uid, e)
            for a in apps:
                uid = a.get("applicantId")
                a["applicantProfile"] = profiles.get(uid, {})
        return _resp(200, apps)
    r = T_APP.query(
        IndexName="ByApplicant",
        KeyConditionExpression=Key("applicantIdGsi").eq(sub),
        Limit=200,
    )
    return _resp(200, r.get("Items", []))
