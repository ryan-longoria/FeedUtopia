from http_utils import _resp, _path
from auth import _claims
from config import UUID_PATH, DEBUG_TRYOUTS
from routes import tryouts as r_tryouts
from routes import wrestlers as r_wrestlers
from routes import promoters as r_promoters
from routes import applications as r_apps

def lambda_handler(event, _ctx):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path = _path(event)

    if method == "OPTIONS":
        return {"statusCode": 204, "headers": {"content-type": "application/json"}, "body": ""}

    # Public endpoints
    if method == "GET" and path == "/tryouts":
        return r_tryouts._get_tryouts(event)
    if method == "GET" and UUID_PATH.fullmatch(path):
        tryout_id = path.rsplit("/", 1)[1]
        return r_tryouts._get_tryout(tryout_id)
    if method == "GET" and path.startswith("/profiles/wrestlers/") and path != "/profiles/wrestlers/me":
        handle = path.split("/")[-1]
        return r_wrestlers._get_profile_by_handle(handle)
    if method == "GET" and path.startswith("/profiles/promoters/") and path != "/profiles/promoters/me":
        user_id = path.split("/")[-1]
        return r_promoters._get_promoter_public(user_id)
    if method == "GET" and path.startswith("/promoters/") and path.endswith("/tryouts"):
        user_id = path.split("/")[2]
        return r_tryouts._get_open_tryouts_by_owner(user_id)

    # Auth-required
    sub, groups = _claims(event)
    if not sub:
        return _resp(401, {"message": "Unauthorized"})

    if path == "/health":
        from http_utils import _now_iso
        return _resp(200, {"ok": True, "time": _now_iso()})

    if method == "GET" and path == "/profiles/wrestlers/me":
        from .db.tables import T_WREST
        item = T_WREST.get_item(Key={"userId": sub}).get("Item") or {}
        item.setdefault("mediaKeys", [])
        item.setdefault("highlights", [])
        return _resp(200, item)

    if method == "PUT" and path == "/profiles/wrestlers/me":
        return r_wrestlers._put_me_profile(sub, groups, event)

    if path.startswith("/profiles/wrestlers") and method in ("POST","PATCH"):
        return r_wrestlers._upsert_wrestler_profile(sub, groups, event)

    if method == "GET" and path == "/profiles/wrestlers":
        from .auth import _is_promoter, _is_wrestler
        from .db.tables import T_WREST
        if _is_promoter(groups):
            return r_wrestlers._list_wrestlers(groups, event)
        if _is_wrestler(groups):
            item = T_WREST.get_item(Key={"userId": sub}).get("Item") or {}
            item.setdefault("mediaKeys", [])
            item.setdefault("highlights", [])
            return _resp(200, item)
        return _resp(403, {"message": "Wrestler or promoter role required"})

    if method == "GET" and path == "/profiles/promoters/me":
        return r_promoters._get_promoter_profile(sub)

    if method == "GET" and path == "/profiles/promoters":
        return r_promoters._list_promoters(groups, event)

    if path.startswith("/profiles/promoters") and method in ("PUT","POST","PATCH"):
        return r_promoters._upsert_promoter_profile(sub, groups, event)

    if method == "POST" and path == "/tryouts":
        return r_tryouts._post_tryout(sub, groups, event)

    if method == "GET" and path == "/tryouts/mine":
        from .auth import _is_promoter
        if not _is_promoter(groups):
            return _resp(403, {"message": "Promoter role required"})
        from boto3.dynamodb.conditions import Key
        from .db.tables import T_TRY
        r = T_TRY.query(
            IndexName="ByOwner",
            KeyConditionExpression=Key("ownerId").eq(sub),
            ScanIndexForward=False,
            Limit=100,
        )
        return _resp(200, r.get("Items", []))

    if path.startswith("/tryouts/") and method == "DELETE":
        tryout_id = path.split("/")[-1]
        return r_tryouts._delete_tryout(sub, tryout_id)

    if path == "/applications":
        if method == "POST":
            return r_apps._post_application(sub, groups, event)
        if method == "GET":
            return r_apps._get_applications(sub, event)

    if DEBUG_TRYOUTS and path == "/debug/tryouts" and method == "GET":
        return r_tryouts._debug_tryouts()

    return _resp(404, {"message": "Route not found"})
