import json, logging, os
from typing import Any, Dict, List

import boto3, requests
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TEAMS_WEBHOOKS_JSON = os.environ["TEAMS_WEBHOOKS_JSON"]
TARGET_BUCKET       = os.environ["TARGET_BUCKET"]

s3 = boto3.client("s3")

def presign(key: str, exp: int = 7 * 24 * 3600) -> str:
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": TARGET_BUCKET, "Key": key},
        ExpiresIn=exp,
    )

def build_adaptive_card(urls: List[str], account: str) -> Dict[str, Any]:
    columns = [{
        "type": "Column",
        "width": "auto",
        "items": [{
            "type":  "Image",
            "url":   u,
            "size":  "Medium",
            "selectAction": {"type": "Action.OpenUrl", "url": u}
        }]
    } for u in urls]

    adaptive = {
        "$schema":  "http://adaptivecards.io/schemas/adaptive-card.json",
        "type":     "AdaptiveCard",
        "version":  "1.2",
        "body": [
            {"type": "TextBlock",
             "text": "Your weekly news post is ready!",
             "size": "Large",
             "weight": "Bolder",
             "color": "Accent"},
            {"type": "TextBlock",
             "text": account,
             "spacing": "None"},
            {"type": "ColumnSet",
             "spacing": "Medium",
             "columns": columns}
        ]
    }

    return adaptive

def lambda_handler(event: Dict[str, Any], _ctx: Any) -> Dict[str, Any]:
    logger.info("notify_post event: %s", json.dumps(event))

    try:
        teams_map = json.loads(TEAMS_WEBHOOKS_JSON)
    except json.JSONDecodeError:
        logger.error("TEAMS_WEBHOOKS_JSON is not valid JSON")
        return {"error": "bad webhook map"}

    account = (event.get("accountName") or "").lower()
    if account not in teams_map:
        logger.error("No Teams webhook for account '%s'", account)
        return {"error": "no webhook"}

    image_keys = event.get("imageKeys") or []
    if not image_keys:
        logger.error("No imageKeys provided")
        return {"error": "no images"}

    thumb_urls: List[str] = []
    for key in image_keys:
        try:
            thumb_urls.append(presign(key))
        except ClientError as exc:
            logger.warning("Presign failed for %s: %s", key, exc)

    if not thumb_urls:
        logger.error("Could not generate any presigned URLs")
        return {"error": "presign failed"}

    card_json = build_adaptive_card(thumb_urls, account)
    webhook_url = teams_map[account]["manual"]

    try:
        resp = requests.post(
            webhook_url,
            headers={"Content-Type": "application/json"},
            data=json.dumps(card_json),
            timeout=20,
        )
        logger.info("Teams webhook → %s %s", resp.status_code, resp.text.strip()[:200])
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.exception("Failed to post to Teams: %s", exc)
        return {"error": str(exc)}

    logger.info("Posted %d thumbnails to Teams for %s", len(thumb_urls), account)
    return {"status": "posted", "thumbCount": len(thumb_urls)}
