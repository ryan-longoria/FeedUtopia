import json
import logging
import os
from typing import Any, Dict, List

import boto3
import requests
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TEAMS_WEBHOOKS_JSON = os.environ["TEAMS_WEBHOOKS_JSON"]
TARGET_BUCKET       = os.environ["TARGET_BUCKET"]

s3 = boto3.client("s3")

def presign(key: str, exp: int = 7*24*3600) -> str:
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": TARGET_BUCKET, "Key": key},
        ExpiresIn=exp
    )

def build_card(urls: List[str]) -> Dict[str, Any]:
    """Adaptive card with thumbnails."""
    return {
        "type": "message",
        "attachments": [{
            "contentType": "application/vnd.microsoft.card.adaptive",
            "content": {
                "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
                "type": "AdaptiveCard",
                "version": "1.5",
                "body": [
                    {
                        "type": "TextBlock",
                        "size": "Large",
                        "weight": "Bolder",
                        "text": "Your weekly NEWS recap images"
                    },
                    {
                        "type": "ImageSet",
                        "imageSize": "Medium",
                        "spacing": "Medium",
                        "images": [{"url": u} for u in urls]
                    }
                ]
            }
        }]
    }

def lambda_handler(event: Dict[str, Any], _ctx: Any) -> Dict[str, Any]:
    logger.info("notify_post event: %s", json.dumps(event))

    acct = event.get("accountName")
    keys = event.get("imageKeys") or []
    if not (acct and keys):
        return {"error": "accountName or imageKeys missing"}

    try:
        webhooks = json.loads(TEAMS_WEBHOOKS_JSON)
        webhook  = webhooks[acct]["manual"]
    except (KeyError, ValueError) as e:
        msg = f"No Teams webhook for account {acct}: {e}"
        logger.error(msg)
        return {"error": msg}

    urls = []
    for k in keys:
        try:
            urls.append(presign(k))
        except ClientError as e:
            logger.warning("Presign failed for %s: %s", k, e)

    if not urls:
        return {"error": "Could not presign any URLs"}

    card = build_card(urls)

    try:
        resp = requests.post(webhook, json=card, timeout=20)
        resp.raise_for_status()
        logger.info("Posted %d thumbnails to Teams for %s", len(urls), acct)
    except requests.RequestException as e:
        logger.exception("POST to Teams failed: %s", e)
        return {"error": str(e)}

    return {"status": "sent", "images": len(urls)}
