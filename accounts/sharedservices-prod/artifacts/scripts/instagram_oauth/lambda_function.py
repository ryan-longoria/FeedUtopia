import json
import os

import requests


CLIENT_ID = os.environ["INSTAGRAM_APP_ID"]
CLIENT_SECRET = os.environ["INSTAGRAM_APP_SECRET"]
REDIRECT_URI = os.environ["REDIRECT_URI"]


def lambda_handler(event, context):
    """Handle OAuth callback: exchange code for access token."""
    params = event.get("queryStringParameters") or {}
    code = params.get("code")
    state = params.get("state")

    response = requests.post(
        "https://api.instagram.com/oauth/access_token",
        data={
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "grant_type": "authorization_code",
            "redirect_uri": REDIRECT_URI,
            "code": code,
        },
    )
    data = response.json()

    return {
        "statusCode": 200,
        "headers": {"Content-Type": "text/html"},
        "body": "<h1>Setup Complete!</h1>",
    }
