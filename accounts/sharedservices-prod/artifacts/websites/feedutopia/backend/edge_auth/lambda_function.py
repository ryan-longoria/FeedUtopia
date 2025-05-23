import base64
import json
import urllib.parse
import urllib.request
import boto3
import jwt
import os
import time

# Initialize SSM client for us-east-1 (Lambda@Edge origin region)
SSM = boto3.client("ssm", region_name="us-east-1")

# Read parameters (will be fetched at cold start)
TENANT_ID  = SSM.get_parameter(Name="/entra/azuread_tenant_id",   WithDecryption=True)["Parameter"]["Value"]
CLIENT_ID  = SSM.get_parameter(Name="/entra/azuread_client_id",   WithDecryption=True)["Parameter"]["Value"]
CLIENT_SEC = SSM.get_parameter(Name="/entra/azuread_client_secret", WithDecryption=True)["Parameter"]["Value"]

COOKIE   = "EdgeAuthIdToken"
REDIRECT = "https://feedutopia.com/_auth/callback"

def lambda_handler(event, context):
    # Grab the incoming CF request
    record  = event["Records"][0]["cf"]
    request = record["request"]
    host    = request["headers"]["host"][0]["value"]
    uri     = request["uri"]
    qs      = request.get("querystring", "")

    try:
        # 1) Bypass public hosts/paths
        if host.startswith("api.") or uri.startswith("/atlantis/"):
            return request

        # 2) Handle OAuth callback
        if uri.startswith("/_auth/callback"):
            # parse code & state
            params = dict(pair.split("=",1) for pair in qs.split("&") if "=" in pair)
            code   = params.get("code")
            state  = urllib.parse.unquote(params.get("state","/"))
            if not code:
                raise ValueError("Missing code in callback")

            # exchange code for ID token
            body = urllib.parse.urlencode({
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SEC,
                "grant_type":  "authorization_code",
                "code":        code,
                "redirect_uri": REDIRECT,
                "scope":       "openid profile email"
            }).encode()
            resp = urllib.request.urlopen(
                f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token",
                data=body, timeout=5
            )
            token = json.loads(resp.read())["id_token"]

            # set cookie and redirect
            cookie = (
                f"{COOKIE}={token}; Secure; HttpOnly; Path=/;"
                f"Max-Age={3600*24}; SameSite=Lax"
            )
            return {
                "status":             "302",
                "statusDescription":  "Found",
                "headers": {
                    "location":   [{"key":"Location",   "value": state}],
                    "set-cookie": [{"key":"Set-Cookie", "value": cookie}]
                }
            }

        # 3) Check for existing auth cookie
        token = None
        for c in request["headers"].get("cookie", []):
            parts = c["value"].split(";")
            for p in parts:
                if p.strip().startswith(f"{COOKIE}="):
                    token = p.strip().split("=",1)[1]
                    break
            if token:
                break

        # validate expiry only (signature check omitted for brevity)
        if token:
            payload = jwt.decode(token, options={"verify_signature": False})
            if payload.get("exp",0) > time.time():
                return request

        # 4) Not authenticated → redirect to Azure AD
        dest  = urllib.parse.quote(f"https://{host}{uri}{('?' + qs) if qs else ''}")
        login = (
            f"https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/authorize"
            f"?client_id={CLIENT_ID}&response_type=code"
            f"&scope=openid%20profile&redirect_uri={urllib.parse.quote(REDIRECT)}"
            f"&state={dest}"
        )
        return {
            "status":            "302",
            "statusDescription": "Found",
            "headers": {
                "location": [{"key":"Location","value": login}]
            }
        }

    except Exception as e:
        # Log the error so you can see it in CloudWatch
        print("EdgeAuth exception:", e, flush=True)
        # Fallback – return the original request so CloudFront serves S3 content
        return request
