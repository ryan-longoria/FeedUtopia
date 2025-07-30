import json
import os
import time
import logging

import boto3
import requests
from botocore.exceptions import ClientError, BotoCoreError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s"
)
logger = logging.getLogger(__name__)

s3  = boto3.client("s3")
sfn = boto3.client("stepfunctions")
dynamodb = boto3.resource("dynamodb")

BUCKET   = os.environ["UPLOAD_BUCKET"]
API_KEY  = os.environ["FEEDUTOPIA_API_KEY"]
NEWS_TBL = os.environ["NEWS_TABLE"]
CAROUSEL_SFN_ARN = os.environ.get("CAROUSEL_STATE_MACHINE_ARN", "")

news_table = dynamodb.Table(NEWS_TBL)

FEED_API = "https://api.feedutopia.com/start-execution"
HEADERS = {
    "User-Agent": "Utopium/1.0",
    "x-api-key":  API_KEY,
}


def cache_if_news(payload: dict, media_key: str) -> None:
    """Cache NEWS/TRAILER posts for weekly recap."""
    artifact = (payload.get("spinningArtifact") or "").upper()
    if artifact not in ("NEWS", "TRAILER"):
        return

    now = int(time.time())
    record = {
        "spinningArtifact": artifact,
        "accountName":      payload["accountName"],
        "createdAt":        now,
        "expiresAt":        now + 9 * 24 * 3600,
        "title":            payload.get("title", ""),
        "subtitle":         payload.get("description", ""),
        "highlightWordsTitle":       payload.get("highlightWordsTitle", ""),
        "highlightWordsDescription": payload.get("highlightWordsDescription", ""),
        "backgroundType":            payload.get("backgroundType", "image"),
        "s3Bucket": BUCKET,
        "s3Key":    media_key,
    }

    try:
        news_table.put_item(Item=record)
        logger.info("Cached %s post in DynamoDB (%s)", artifact, NEWS_TBL)
    except ClientError as err:
        logger.error("PutItem denied -- %s", err, exc_info=True)
    except Exception as err:
        logger.error("Unexpected PutItem error -- %s", err, exc_info=True)


def _is_carousel(data: dict) -> bool:
    if (data.get("backgroundType") or "").lower() == "carousel":
        return True
    slides = data.get("slides")
    return isinstance(slides, list) and len(slides) > 0


def lambda_handler(event, _ctx):
    logger.info("Received event keys: %s", list(event.keys()) if isinstance(event, dict) else type(event))

    body_raw = event.get("body", "{}")
    try:
        data = json.loads(body_raw)
    except json.JSONDecodeError as err:
        logger.error("Body is not valid JSON: %s", err)
        return _bad("invalid JSON body")

    # Debug snapshot of incoming payload
    logger.info(
        "Incoming keys=%s bgType=%r hasSlides=%s",
        list(data.keys()),
        data.get("backgroundType"),
        isinstance(data.get("slides"), list)
    )

    # ── Normalise slides and coerce carousel if slides exist ──
    slides_in = data.get("slides")
    if isinstance(slides_in, list):
        fixed_slides = []
        for i, s in enumerate(slides_in):
            key = s.get("key") or s.get("s3Key")
            bgt = (s.get("backgroundType") or s.get("bgType") or "").lower()
            if bgt not in ("photo", "image", "video"):
                bgt = "photo"
            fixed_slides.append({
                **s,
                "key": key,
                "backgroundType": bgt,
            })
        data["slides"] = fixed_slides
        if not (data.get("backgroundType") or ""):
            data["backgroundType"] = "carousel"
    else:
        data["slides"] = []

    logger.info(
        "Post-normalise bgType=%r slides=%d",
        data.get("backgroundType"),
        len(data["slides"])
    )

    # ─────────────────────────────────────────────
    #               CAROUSEL PATH
    # ─────────────────────────────────────────────
    if _is_carousel(data):
        if not CAROUSEL_SFN_ARN:
            logger.error("CAROUSEL_STATE_MACHINE_ARN not configured")
            return _bad("carousel not configured")

        missing = []
        if not (data.get("accountName") or "").strip():
            missing.append("accountName")
        if not (data.get("title") or "").strip():
            missing.append("title")

        slides = data["slides"]
        if not slides:
            missing.append("slides")
        else:
            for i, s in enumerate(slides):
                if not s.get("key"):
                    missing.append(f"slides[{i}].key")
                if not s.get("backgroundType"):
                    missing.append(f"slides[{i}].backgroundType")

        if missing:
            logger.warning("Missing fields (carousel): %s", missing)
            return _bad(f"missing {missing}")

        # Validate uploaded media exists
        for i, s in enumerate(slides):
            try:
                s3.head_object(Bucket=BUCKET, Key=s["key"])
            except Exception as err:
                logger.error("head_object failed for slide %d (%s): %s", i + 1, s["key"], err, exc_info=True)
                return _bad(f"could not stat S3 object for slide {i+1}")

        # <<< CHANGE: include per-slide fields so renderer can use them >>>
        payload = {
            "accountName": data["accountName"],
            "title":       data["title"],
            "description": data.get("description", "") or "",
            "highlightWordsTitle":       data.get("highlightWordsTitle", "") or "",
            "highlightWordsDescription": data.get("highlightWordsDescription", "") or "",
            "spinningArtifact":          data.get("spinningArtifact", "") or "",
            "backgroundType":            "carousel",
            "slides": [
                {
                    "backgroundType": s["backgroundType"],
                    "key": s["key"],
                    # pass through optional per‑slide metadata (renderer supports these aliases)
                    "title":  s.get("title") or s.get("slideTitle") or s.get("titleText") or "",
                    "subtitle": s.get("subtitle") or s.get("description") or s.get("slideSubtitle") or "",
                    "highlightWordsTitle":
                        s.get("highlightWordsTitle") or s.get("hlTitle") or s.get("titleHighlights") or "",
                    "highlightWordsDescription":
                        s.get("highlightWordsDescription")
                        or s.get("highlightWordsSubtitle")
                        or s.get("hlSubtitle")
                        or s.get("subtitleHighlights")
                        or "",
                }
                for s in slides
            ],
            "requestedAt": int(time.time()),
        }
        # >>> END CHANGE

        logger.info("Starting carousel Step Function")
        try:
            res = sfn.start_execution(
                stateMachineArn=CAROUSEL_SFN_ARN,
                input=json.dumps(payload),
            )
            logger.info("Carousel SFN executionArn=%s", res.get("executionArn"))
        except Exception as err:
            logger.error("StartExecution failed: %s", err, exc_info=True)
            return _bad("failed to start carousel workflow")

        # Cache first slide in NEWS/TRAILER flow for weekly recap
        if slides:
            first_key = slides[0]["key"]
            first_type = slides[0]["backgroundType"]
            cache_payload = dict(payload)
            cache_payload["backgroundType"] = first_type
            cache_if_news(cache_payload, media_key=first_key)

        return _ok({"status": "started", "mode": "carousel"})

    # ─────────────────────────────────────────────
    #                 REEL PATH
    # ─────────────────────────────────────────────
    required = ("accountName", "title", "backgroundType", "spinningArtifact", "key")
    missing = [f for f in required if f not in data]
    if missing:
        logger.warning("Missing fields: %s", missing)
        return _bad(f"missing {missing}")

    is_image = data["backgroundType"] in ("image", "photo")
    path_field = "image_path" if is_image else "video_path"

    try:
        meta = s3.head_object(Bucket=BUCKET, Key=data["key"])
        logger.info("Fetched S3 metadata for key %s", data["key"])
    except ClientError as err:
        logger.error("head_object failed: %s", err, exc_info=True)
        return _bad("could not stat S3 object")
    except BotoCoreError as err:
        logger.error("Boto3 error: %s", err, exc_info=True)
        return _bad("internal S3 error")

    payload = {
        "accountName":      data["accountName"],
        "title":            data["title"],
        "spinningArtifact": data["spinningArtifact"],
        "backgroundType":   data["backgroundType"],
        path_field: {
            "bucket": BUCKET,
            "key":    data["key"],
            "contentType":     meta.get("ContentType"),
            "eTag":            meta.get("ETag"),
            "size":            meta.get("ContentLength"),
            "lastChangedTime": meta.get("LastModified").isoformat() if meta.get("LastModified") else "",
        },
    }
    for f in ("description", "highlightWordsTitle", "highlightWordsDescription"):
        if data.get(f):
            payload[f] = data[f]

    logger.info("Calling FeedUtopia /start-execution (reel)")
    try:
        res = requests.post(FEED_API, json=payload, headers=HEADERS, timeout=10)
        res.raise_for_status()
        logger.info("FeedUtopia responded %s", res.status_code)
    except requests.HTTPError as err:
        logger.error("FeedUtopia HTTP %s -- body: %s",
                     err.response.status_code, err.response.text)
        return _bad("backend error")
    except requests.RequestException as err:
        logger.error("Request error: %s", err, exc_info=True)
        return _bad("network error")

    cache_if_news(payload, media_key=data["key"])

    logger.info("create_feed_post completed successfully (reel)")
    return _ok({"status": "success", "feedutopiaResponse": res.json()})


def _ok(body):
    return {
        "statusCode": 200,
        "headers": {"Access-Control-Allow-Origin": "*"},
        "body": json.dumps(body)
    }


def _bad(msg):
    return {
        "statusCode": 400,
        "headers": {"Access-Control-Allow-Origin": "*"},
        "body": json.dumps({"error": str(msg)})
    }
