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
    """Return a presigned GET URL for this object."""
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": TARGET_BUCKET, "Key": key},
        ExpiresIn=exp,
    )


def build_message_card(urls: List[str], account: str) -> Dict[str, Any]:
    """
    Legacy **MessageCard** payload – this is the format Teams’ incoming‑webhook
    connector renders most reliably (thumbnail grid + pink stripe).
    Clicking a thumbnail opens the image in Teams’ viewer.
    """
    return {
        "@type":    "MessageCard",
        "@context": "http://schema.org/extensions",
        "summary":  f"Weekly NEWS recap for {account}",
        "themeColor": "EC008C",
        "title":    "Your weekly news post is ready!",
        "sections": [
            {
                "activityTitle": f"**{account}**",
                "images": [
                    {
                        "image": u,
                        "title": f"Recap {i+1}"
                    }
                    for i, u in enumerate(urls)
                ]
            }
        ],
    }


def lambda_handler(event: Dict[str, Any], _ctx: Any) -> Dict[str, Any]:
    logger.info("notify_post event: %s", json.dumps(event))

    try:
        teams_map = json.loads(TEAMS_WEBHOOKS_JSON)
    except json.JSONDecodeError:
        logger.error("TEAMS_WEBHOOKS_JSON is invalid JSON")
        return {"error": "bad webhook map"}

    account = (event.get("accountName") or "").lower()
    if account not in teams_map:
        logger.error("No Teams webhook for account '%s'", account)
        return {"error": "no webhook"}

    keys = event.get("imageKeys") or []
    if not keys:
        logger.error("No imageKeys provided")
        return {"error": "no images"}

    urls: List[str] = []
    for k in keys:
        try:
            urls.append(presign(k))
        except ClientError as exc:
            logger.warning("Presign failed for %s: %s", k, exc)

    if not urls:
        logger.error("Failed to generate presigned URLs")
        return {"error": "presign failed"}

    card = build_message_card(urls, account)
    webhook_url = teams_map[account]["manual"]

    try:
        resp = requests.post(
            webhook_url,
            headers={"Content-Type": "application/json"},
            data=json.dumps(card),
            timeout=20,
        )
        logger.info("Teams webhook → %s %s", resp.status_code, resp.text.strip()[:200])
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.exception("Failed to post to Teams: %s", exc)
        return {"error": str(exc)}

    logger.info("Posted %d thumbnails to Teams for %s", len(urls), account)
    return {"status": "posted", "thumbCount": len(urls)}
