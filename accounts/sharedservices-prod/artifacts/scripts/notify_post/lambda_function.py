import json
import logging
import os
from typing import Any, Dict, List, Optional

import boto3
import requests
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TEAMS_WEBHOOKS = json.loads(os.environ["TEAMS_WEBHOOKS_JSON"])
TARGET_BUCKET  = os.environ["TARGET_BUCKET"]

s3 = boto3.client("s3")

def presign(key: str, exp: int = 7 * 24 * 3600) -> Optional[str]:
    """Return a presigned GET url for the given S3 key (or None on failure)."""
    try:
        return s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": TARGET_BUCKET, "Key": key},
            ExpiresIn=exp,
        )
    except ClientError as exc:
        logger.warning("presign %s failed: %s", key, exc)
        return None


def card_thumbnails(account: str, urls: List[str]) -> Dict[str, Any]:
    """Adaptive‑Card with clickable thumbnails."""
    images = [
        {
            "type": "Image",
            "url": u,
            "size": "Medium",
            "selectAction": {"type": "Action.OpenUrl", "url": u},
            "altText": f"{account} recap {i+1}",
        }
        for i, u in enumerate(urls)
    ]

    return {
        "type": "message",
        "attachments": [
            {
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
                            "text": f"Weekly NEWS recap – **{account}**",
                            "wrap": True,
                        },
                        {"type": "ImageSet", "images": images, "imageSize": "Medium"},
                    ],
                },
            }
        ],
    }


def card_video_link(url: str) -> Dict[str, Any]:
    """Simple MessageCard with a ‘View video’ link (shows as a previewable tile)."""
    return {
        "@type":    "MessageCard",
        "@context": "http://schema.org/extensions",
        "themeColor": "EC008C",
        "summary":  "New post ready",
        "title":    "Your new post is ready!",
        "text":     f"[View Video]({url})",
    }


def lambda_handler(event: Dict[str, Any], _ctx: Any) -> Dict[str, Any]:
    logger.info("notify_post event: %s", json.dumps(event))

    account = (event.get("accountName") or "").lower()
    image_keys: list[str] = event.get("imageKeys", [])
    video_key: str | None = (
        event.get("videoResult", {}).get("video_key")
        if isinstance(event.get("videoResult"), dict)
        else None
    )

    if not account:
        return {"error": "missing accountName"}

    try:
        webhook_url = TEAMS_WEBHOOKS[account]["manual"]
    except KeyError:
        return {"error": f"No Teams webhook configured for '{account}'"}

    payload: Dict[str, Any]

    if image_keys:
        urls = [u for k in image_keys if (u := presign(k))]
        if not urls:
            return {"error": "could not presign any images"}
        payload = card_thumbnails(account, urls)

    elif video_key:
        video_url = presign(video_key)
        if not video_url:
            return {"error": "could not presign video"}
        payload = card_video_link(video_url)

    else:
        return {"error": "event had neither imageKeys nor videoResult"}

    try:
        r = requests.post(
            webhook_url,
            headers={"Content-Type": "application/json"},
            data=json.dumps(payload),
            timeout=20,
        )
        logger.info("Teams webhook → %s %s", r.status_code, r.text)
        r.raise_for_status()
    except requests.RequestException as exc:
        logger.exception("Post to Teams failed: %s", exc)
        return {"error": str(exc)}

    logger.info(
        "Posted to Teams for %s (%s)",
        account,
        "thumbnails" if image_keys else "video",
    )
    return {"status": "posted"}
