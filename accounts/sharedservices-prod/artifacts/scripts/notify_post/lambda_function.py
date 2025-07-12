import json
import logging
import os
from typing import Any, Dict, List

import boto3
import requests
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ──────────────────────────────────────────────────────────────────────────────
# Environment & global clients
# ──────────────────────────────────────────────────────────────────────────────
TEAMS_WEBHOOKS_ENV = "TEAMS_WEBHOOKS_JSON"
TARGET_BUCKET_ENV  = "TARGET_BUCKET"

s3 = boto3.client("s3")

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
def get_environment_variables() -> Dict[str, str]:
    try:
        return {
            "teams_webhooks_json": os.environ[TEAMS_WEBHOOKS_ENV],
            "target_bucket":       os.environ[TARGET_BUCKET_ENV],
        }
    except KeyError as missing:
        raise ValueError(f"Missing env var {missing}") from None


def get_teams_webhook_url(webhooks: Dict[str, Dict[str, str]], account: str) -> str:
    """Return the manual‑posting channel for an account."""
    return webhooks[account]["manual"]


def generate_presigned_s3_url(bucket: str, key: str, expiration: int = 7 * 24 * 3600) -> str:
    try:
        return s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=expiration,
        )
    except ClientError as exc:
        logger.warning("Presign failed for %s/%s – %s", bucket, key, exc)
        return ""


def build_message_card(account: str, thumbs: List[str]) -> Dict[str, Any]:
    """Classic MessageCard with inline thumbnails (works in every Teams tenant)."""
    return {
        "@type":    "MessageCard",
        "@context": "http://schema.org/extensions",
        "summary":  "Weekly recap ready",
        "themeColor": "EC008C",
        "title":    "Your weekly news post is ready!",
        "sections": [
            {
                "activityTitle": account,
                "images": [
                    {"image": url, "title": f"Recap {i+1}"}
                    for i, url in enumerate(thumbs)
                ],
            }
        ],
    }

# ──────────────────────────────────────────────────────────────────────────────
# Lambda entry‑point
# ──────────────────────────────────────────────────────────────────────────────
def lambda_handler(event: Dict[str, Any], _ctx: Any) -> Dict[str, Any]:
    logger.info("notify_post event: %s", json.dumps(event))

    try:
        env = get_environment_variables()
    except ValueError as err:
        logger.error(str(err))
        return {"error": str(err)}

    account = (event.get("accountName") or "").lower()
    keys    = event.get("imageKeys", [])

    if not account or not keys:
        logger.error("Missing accountName or imageKeys")
        return {"error": "invalid event"}

    try:
        webhooks = json.loads(env["teams_webhooks_json"])
        webhook_url = get_teams_webhook_url(webhooks, account)
    except (json.JSONDecodeError, KeyError) as err:
        logger.error("No Teams webhook for %s – %s", account, err)
        return {"error": "no webhook"}

    thumb_urls = [
        u for k in keys if (u := generate_presigned_s3_url(env["target_bucket"], k))
    ]
    if not thumb_urls:
        logger.error("Could not generate any presigned URLs")
        return {"error": "url generation failed"}

    payload = build_message_card(account, thumb_urls)
    try:
        resp = requests.post(
            webhook_url,
            headers={"Content-Type": "application/json"},
            data=json.dumps(payload),
            timeout=15,
        )
        logger.info("Teams webhook → %s %s", resp.status_code, resp.text)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.exception("Teams post failed: %s", exc)
        return {"error": str(exc)}

    logger.info("Posted %d thumbnails to Teams for %s", len(thumb_urls), account)
    return {"status": "posted", "thumbCount": len(thumb_urls)}