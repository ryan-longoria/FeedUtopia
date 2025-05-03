import os
import json

VERIFY_TOKEN = os.getenv("VERIFY_TOKEN", "your_fallback_token")

def lambda_handler(event, context):
    """
    Handles GET for webhook verification and POST for incoming Instagram events.
    """
    method = event.get("requestContext", {}).get("http", {}).get("method")
    if not method:
        method = event.get("httpMethod")

    if method == "GET":
        params = event.get("queryStringParameters") or {}
        mode      = params.get("hub.mode")
        token     = params.get("hub.verify_token")
        challenge = params.get("hub.challenge")

        if mode == "subscribe" and token == VERIFY_TOKEN and challenge:
            return {
                "statusCode": 200,
                "body": challenge
            }
        else:
            return {
                "statusCode": 403,
                "body": "Verification failed"
            }

    elif method == "POST":
        try:
            payload = json.loads(event.get("body") or "{}")
        except json.JSONDecodeError:
            return { "statusCode": 400, "body": "Invalid JSON" }

        print("Received Instagram webhook:", json.dumps(payload))

        return {
            "statusCode": 200,
            "body": "OK"
        }

    else:
        return {
            "statusCode": 405,
            "body": "Method not allowed"
        }
