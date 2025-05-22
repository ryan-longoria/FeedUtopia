import base64, json, urllib.parse, urllib.request, boto3, jwt, os, time

SSM = boto3.client("ssm", region_name="us-east-1")
TENANT_ID  = SSM.get_parameter(Name="/entra/azuread_tenant_id",  WithDecryption=True)["Parameter"]["Value"]
CLIENT_ID  = SSM.get_parameter(Name="/entra/azuread_client_id",   WithDecryption=True)["Parameter"]["Value"]
CLIENT_SEC = SSM.get_parameter(Name="/entra/azuread_client_secret", WithDecryption=True)["Parameter"]["Value"]
COOKIE     = "EdgeAuthIdToken"
REDIRECT   = "https://feedutopia.com/_auth/callback"

def lambda_handler(event, context):
    req   = event["Records"][0]["cf"]["request"]
    host  = req["headers"]["host"][0]["value"]
    uri   = req["uri"]
    qs    = req.get("querystring", "")

    if host.startswith("api.") or uri.startswith("/atlantis/"):
        return req

    if uri.startswith("/_auth/callback"):
        params = dict(x.split("=",1) for x in qs.split("&"))
        code  = params.get("code"); state = urllib.parse.unquote(params.get("state","/"))
        body = urllib.parse.urlencode({
            "client_id": CLIENT_ID, "client_secret": CLIENT_SEC,
            "grant_type": "authorization_code", "code": code,
            "redirect_uri": REDIRECT, "scope": "openid profile email"
        }).encode()
        token = json.loads(urllib.request.urlopen(
            f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token",
            data=body, timeout=3).read())["id_token"]

        cookie = f"{COOKIE}={token}; Secure; HttpOnly; Path=/; Max-Age={3600*24}; SameSite=Lax"
        return {"status":"302", "statusDescription":"Found",
                "headers":{"location":[{"key":"Location","value":state}],
                           "set-cookie":[{"key":"Set-Cookie","value":cookie}]}}
    hdr = req["headers"].get("cookie", [])
    token = next((c["value"].split("=",1)[1] for c in hdr
                  if COOKIE in c["value"]), None)
    if token:
        try:
            if jwt.decode(token, options={"verify_signature": False})["exp"] > time.time():
                return req
        except Exception:
            pass

    dest  = urllib.parse.quote(f"https://{host}{uri}{'?' + qs if qs else ''}")
    login = ("https://login.microsoftonline.com/"
             f"{TENANT_ID}/oauth2/v2.0/authorize?"
             f"client_id={CLIENT_ID}&response_type=code&scope=openid%20profile"
             f"&redirect_uri={urllib.parse.quote(REDIRECT)}&state={dest}")
    return {"status":"302", "headers":{"location":[{"key":"Location","value":login}]}}
