import json, os, uuid, datetime
import boto3
from boto3.dynamodb.conditions import Key, Attr

ddb  = boto3.resource("dynamodb")
T_WREST = ddb.Table(os.environ["TABLE_WRESTLERS"])
T_PROMO = ddb.Table(os.environ["TABLE_PROMOTERS"])
T_TRY   = ddb.Table(os.environ["TABLE_TRYOUTS"])
T_APP   = ddb.Table(os.environ["TABLE_APPS"])

def resp(status, body=None):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body or {})
    }

def _claims(event):
    # HTTP API v2 JWT claims
    jwt = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {})
    claims = jwt.get("claims", {}) if isinstance(jwt.get("claims"), dict) else {}
    sub  = claims.get("sub")
    groups = claims.get("cognito:groups", "")
    if isinstance(groups, str):
        groups = groups.split(",") if groups else []
    return sub, set(groups)

def _json(event):
    try:
        return json.loads(event.get("body") or "{}")
    except Exception:
        return {}

def _path(event):
    # e.g. "/tryouts/123"
    return (event.get("rawPath") or "/").rstrip("/")

def _qs(event):
    return event.get("queryStringParameters") or {}

def only_promoter(groups):
    return "Promoters" in groups

def only_wrestler(groups):
    return "Wrestlers" in groups

def lambda_handler(event, _ctx):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    path   = _path(event)
    sub, groups = _claims(event)

    if not sub:
        return resp(401, {"message": "Unauthorized"})

    # ---- Wrestler profile ----
    if path.startswith("/profiles/wrestlers"):
        if method in ("POST","PUT","PATCH"):
            if not only_wrestler(groups):
                return resp(403, {"message":"Wrestler role required"})
            data = _json(event)
            data["userId"] = sub
            # simple schema normalization
            data.setdefault("role","Wrestler")
            # upsert
            T_WREST.put_item(Item=data)
            return resp(200, {"ok": True, "userId": sub})

        if method == "GET":
            # promoter-only visibility (your rule)
            if not only_promoter(groups):
                return resp(403, {"message": "Promoter role required to view wrestler profiles"})
            qs = _qs(event)  # filters: q, style, city, verified
            style = qs.get("style")
            city  = qs.get("city")
            verified = qs.get("verified")
            # MVP: scan + filters; scale later with GSIs
            fe = []
            if style:    fe.append(Attr("styles").contains(style))
            if city:     fe.append(Attr("city").contains(city))
            if verified == "true": fe.append(Attr("verified_school").eq(True))
            filter_expr = None
            for f in fe:
                filter_expr = f if filter_expr is None else filter_expr & f
            if filter_expr is None:
                result = T_WREST.scan(Limit=100)
            else:
                result = T_WREST.scan(FilterExpression=filter_expr, Limit=100)
            return resp(200, result.get("Items", []))

    # ---- Promoter profile ----
    if path.startswith("/profiles/promoters"):
        if method in ("POST","PUT","PATCH"):
            if not only_promoter(groups):
                return resp(403, {"message":"Promoter role required"})
            data = _json(event)
            data["userId"] = sub
            data.setdefault("role","Promoter")
            T_PROMO.put_item(Item=data)
            return resp(200, {"ok": True, "userId": sub})

        if method == "GET":
            # Return caller’s own promoter profile
            item = T_PROMO.get_item(Key={"userId": sub}).get("Item")
            return resp(200, item or {})

    # ---- Tryouts ----
    if path == "/tryouts":
        if method == "POST":
            if not only_promoter(groups):
                return resp(403, {"message": "Promoter role required"})
            data = _json(event)
            tid = str(uuid.uuid4())
            item = {
                "tryoutId": tid,
                "ownerId": sub,
                "orgName": data.get("orgName") or data.get("org") or "",
                "city": data.get("city") or "",
                "date": data.get("date") or "",
                "slots": int(data.get("slots") or 0),
                "requirements": data.get("requirements") or "",
                "contact": data.get("contact") or "",
                "status": data.get("status") or "open",
                "createdAt": datetime.datetime.utcnow().isoformat()
            }
            T_TRY.put_item(Item=item)
            return resp(200, item)

        if method == "GET":
            # list open tryouts ordered by date (use GSI)
            r = T_TRY.query(
                IndexName="OpenByDate",
                KeyConditionExpression=Key("status").eq("open"),
                ScanIndexForward=True, # ascending by date
                Limit=100
            )
            return resp(200, r.get("Items", []))

    if path.startswith("/tryouts/"):
        tryout_id = path.split("/")[-1]
        if method == "DELETE":
            # Only owner can delete
            # First read to verify ownership
            item = T_TRY.get_item(Key={"tryoutId": tryout_id}).get("Item")
            if not item: return resp(404, {"message":"Not found"})
            if item.get("ownerId") != sub:
                return resp(403, {"message":"Not your tryout"})
            T_TRY.delete_item(Key={"tryoutId": tryout_id})
            return resp(200, {"ok": True})

        if method == "GET":
            item = T_TRY.get_item(Key={"tryoutId": tryout_id}).get("Item")
            return resp(200, item or {})

    # ---- Applications ----
    if path == "/applications":
        if method == "POST":
            if not only_wrestler(groups):
                return resp(403, {"message":"Wrestler role required"})
            data = _json(event)
            tryout_id = data.get("tryoutId")
            if not tryout_id: return resp(400, {"message":"tryoutId required"})
            now = datetime.datetime.utcnow().isoformat()
            # prevent duplicate application per wrestler per tryout
            T_APP.put_item(
                Item={
                    "tryoutId": tryout_id,
                    "applicantId": sub,
                    "applicantIdGsi": sub,
                    "timestamp": now,
                    "notes": data.get("notes",""),
                    "reelLink": data.get("reelLink",""),
                    "status": "submitted"
                },
                ConditionExpression="attribute_not_exists(tryoutId) AND attribute_not_exists(applicantId)"
            )
            return resp(200, {"ok": True, "tryoutId": tryout_id})

        if method == "GET":
            qs = _qs(event)
            # promoter reviews all apps for a tryout
            if "tryoutId" in qs:
                tryout_id = qs["tryoutId"]
                # ownership check
                tr = T_TRY.get_item(Key={"tryoutId": tryout_id}).get("Item")
                if not tr: return resp(404, {"message":"Tryout not found"})
                if tr.get("ownerId") != sub:
                    return resp(403, {"message":"Not your tryout"})
                r = T_APP.query(
                    KeyConditionExpression=Key("tryoutId").eq(tryout_id),
                    Limit=200
                )
                return resp(200, r.get("Items", []))
            # wrestler views their own applications
            r = T_APP.query(
                IndexName="ByApplicant",
                KeyConditionExpression=Key("applicantIdGsi").eq(sub),
                Limit=200
            )
            return resp(200, r.get("Items", []))

    return resp(404, {"message": "Route not found"})
