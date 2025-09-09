import os, json, boto3, time, urllib.parse

s3   = boto3.client("s3")
BUCK = os.environ["MEDIA_BUCKET"]

def resp(status, body):
    return {"statusCode": status, "headers": {"content-type":"application/json"}, "body": json.dumps(body)}

def lambda_handler(event, _ctx):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")

    # --- Allow CORS preflight without auth ---
    if method == "OPTIONS":
        return {
            "statusCode": 204,
            "headers": {
                "content-type": "application/json"
            },
            "body": ""
        }
    
    # Claims available from authorizer
    claims = (event.get("requestContext",{}).get("authorizer",{}).get("jwt",{}) or {}).get("claims",{})
    sub = claims.get("sub")
    if not sub: return resp(401, {"message":"Unauthorized"})
    qs = event.get("queryStringParameters") or {}
    key  = qs.get("key") or ""
    ctype= qs.get("contentType") or "application/octet-stream"

    # Force user-specific prefix
    safe_name = urllib.parse.quote(key, safe="")
    object_key = f"user/{sub}/{safe_name}"

    url = s3.generate_presigned_url(
        ClientMethod="put_object",
        Params={"Bucket": BUCK, "Key": object_key, "ContentType": ctype},
        ExpiresIn=300
    )
    return resp(200, {"uploadUrl": url, "objectKey": object_key})
