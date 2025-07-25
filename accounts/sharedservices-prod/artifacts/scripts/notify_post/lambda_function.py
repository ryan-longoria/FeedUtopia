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


def build_image_card(urls: List[str], account: str) -> Dict[str, Any]:
    MAX_EMBED = 6
    embedded = urls[:MAX_EMBED]
    return {
        "@type":       "MessageCard",
        "@context":    "http://schema.org/extensions",
        "summary":     f"Weekly NEWS recap for {account}",
        "themeColor":  "EC008C",
        "title":       "Your weekly recap post is ready!",
        "text":        f"**{account}**",
        "sections": [
            {
                "images": [
                    {"image": u, "title": f"Recap {i+1}"}
                    for i, u in enumerate(embedded)
                ]
            }
        ],
        "potentialAction": [
            {
                "@type":  "OpenUri",
                "name":   f"Download Recap {i+1}",
                "targets":[{"os":"default","uri":u}],
            }
            for i, u in enumerate(urls)
        ],
    }


def build_video_card(url: str, account: str) -> Dict[str, Any]:
    return {
        "@type":    "MessageCard",
        "@context": "http://schema.org/extensions",
        "summary":  f"Your video for {account} is ready!",
        "themeColor": "EC008C",
        "title":    "Your video is ready!",
        "text":     f"**{account}**",
        "potentialAction": [
            {
                "@type":  "OpenUri",
                "name":   "Download Video",
                "targets": [{"os": "default", "uri": url}],
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

    webhook_url = teams_map[account]["manual"]

    keys = event.get("imageKeys") or []
    video_key = (
        event.get("video_key")
        or (event.get("videoResult") or {}).get("video_key")
    )
    if video_key:
        keys = [video_key]

    if not keys:
        logger.error("No imageKeys or video_key provided")
        return {"error": "no images or video"}

    urls = []
    for k in keys:
        try:
            urls.append(presign(k))
        except ClientError as exc:
            logger.warning("Presign failed for %s: %s", k, exc)

    if video_key:
        card = build_video_card(urls[0], account)
        logger.info("Posting video card for %s", account)
        resp = requests.post(webhook_url,
                             headers={"Content-Type": "application/json"},
                             data=json.dumps(card),
                             timeout=20)
        resp.raise_for_status()

    else:
        MAX_PER_CARD = 6
        for idx in range(0, len(urls), MAX_PER_CARD):
            batch = urls[idx : idx + MAX_PER_CARD]
            card = build_image_card(batch, account)
            logger.info(
                "Posting image card %d–%d for %s",
                idx + 1, min(idx + MAX_PER_CARD, len(urls)), account
            )
            resp = requests.post(webhook_url,
                                 headers={"Content-Type": "application/json"},
                                 data=json.dumps(card),
                                 timeout=20)
            resp.raise_for_status()

    logger.info("Posted %d item(s) to Teams for %s", len(urls), account)
    return {"status": "posted", "itemCount": len(urls)}
