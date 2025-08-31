import json
import logging
import os
import re
from typing import Any, Dict, List

import boto3
import requests
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

TEAMS_WEBHOOKS_JSON = os.environ["TEAMS_WEBHOOKS_JSON"]
TARGET_BUCKET = os.environ["TARGET_BUCKET"]

s3 = boto3.client("s3")


def presign(key: str, exp: int = 7 * 24 * 3600) -> str:
    params = {"Bucket": TARGET_BUCKET, "Key": key}
    basename = os.path.basename(key)

    if key.lower().endswith(".mp4"):
        params["ResponseContentDisposition"] = f'attachment; filename="{basename}"'
        params["ResponseContentType"] = "video/mp4"

    return s3.generate_presigned_url("get_object", Params=params, ExpiresIn=exp)


def build_image_card(urls: List[str], account: str) -> Dict[str, Any]:
    MAX_EMBED = 6
    embedded = urls[:MAX_EMBED]
    return {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "summary": f"Carousel assets for {account}",
        "themeColor": "EC008C",
        "title": "Your carousel is ready!",
        "text": f"**{account}**",
        "sections": [
            {
                "images": [{"image": u, "title": f"Asset {i+1}"} for i, u in enumerate(embedded)]
            }
        ],
        "potentialAction": [
            {"@type": "OpenUri", "name": f"Download {i+1}", "targets": [{"os": "default", "uri": u}]}
            for i, u in enumerate(urls)
        ],
    }


def build_video_card(url: str, account: str) -> Dict[str, Any]:
    return {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "summary": f"Your video for {account} is ready!",
        "themeColor": "EC008C",
        "title": "Your video is ready!",
        "text": f"**{account}**",
        "potentialAction": [{"@type": "OpenUri", "name": "Download Video", "targets": [{"os": "default", "uri": url}]}],
    }


def flatten_keys(evt: Dict[str, Any]) -> List[str]:
    SLIDE_RE = re.compile(r"slide_(\d{2})\.(mp4|png|jpg|jpeg|webp)$", re.IGNORECASE)
    keys: List[str] = []

    if isinstance(evt.get("imageKeys"), list):
        keys.extend([k for k in evt["imageKeys"] if isinstance(k, str)])

    video_key = evt.get("video_key") or (evt.get("videoResult") or {}).get("video_key")
    if isinstance(video_key, str) and video_key:
        keys.append(video_key)

    cr = evt.get("carouselResult") or {}
    if isinstance(cr.get("imageKeys"), list):
        keys.extend([k for k in cr["imageKeys"] if isinstance(k, str)])

    seen, ordered = set(), []
    for k in keys:
        if k not in seen:
            ordered.append(k); seen.add(k)

    best_by_slide: Dict[str, str] = {}
    order_by_slide: List[str] = []

    for k in ordered:
        m = SLIDE_RE.search(k)
        if not m:
            best_by_slide[k] = k
            order_by_slide.append(k)
            continue

        slide_id = m.group(1)
        ext = m.group(2).lower()
        prev = best_by_slide.get(slide_id)
        if prev is None:
            best_by_slide[slide_id] = k
            order_by_slide.append(slide_id)
        else:
            if ext == "mp4" and not prev.lower().endswith(".mp4"):
                best_by_slide[slide_id] = k

    final: List[str] = []
    for token in order_by_slide:
        final.append(best_by_slide[token])

    return final


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

    keys = flatten_keys(event)
    if not keys:
        logger.error("No media keys provided")
        return {"error": "no images or video"}
    logger.info("Selected media keys (per-slide, mp4 preferred): %s", keys)

    urls: List[str] = []
    for k in keys:
        try:
            urls.append(presign(k))
        except ClientError as exc:
            logger.warning("Presign failed for %s: %s", k, exc)

    videos = [u for k, u in zip(keys, urls) if k.lower().endswith(".mp4")]
    images = [u for k, u in zip(keys, urls) if k.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))]

    posted = 0

    if videos:
        if len(videos) == 1:
            card = build_video_card(videos[0], account)
        else:
            card = {
                "@type": "MessageCard",
                "@context": "http://schema.org/extensions",
                "summary": f"Your videos for {account} are ready!",
                "themeColor": "EC008C",
                "title": "Your videos are ready!",
                "text": f"**{account}**",
                "potentialAction": [
                    {"@type": "OpenUri", "name": f"Download {i+1}",
                     "targets": [{"os": "default", "uri": u}]}
                    for i, u in enumerate(videos)
                ],
            }
        resp = requests.post(webhook_url, headers={"Content-Type": "application/json"},
                             data=json.dumps(card), timeout=20)
        resp.raise_for_status()
        posted += len(videos)

    if images:
        MAX_PER_CARD = 6
        for i in range(0, len(images), MAX_PER_CARD):
            batch = images[i:i+MAX_PER_CARD]
            card = build_image_card(batch, account)
            resp = requests.post(webhook_url, headers={"Content-Type": "application/json"},
                                 data=json.dumps(card), timeout=20)
            resp.raise_for_status()
            posted += len(batch)

    logger.info("Posted %d item(s) to Teams for %s", posted, account)
    return {"status": "posted", "itemCount": posted}