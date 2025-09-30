# lambda_function.py (image-processor) — EventBridge-aware + idempotency
import os
import io
import time
import logging
from typing import Dict, Any, Iterable, Tuple

import boto3
from botocore.exceptions import ClientError
from PIL import Image

# --- AWS clients/resources
s3  = boto3.client("s3")
ddb = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])

# --- Config
CDN_BASE = os.environ["CDN_BASE"]           # e.g., https://cdn.wrestleutopia.com
VARIANT_WIDTHS = (400, 1200)                # keep original sizes

# --- Logging
logger = logging.getLogger()
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)
logger.setLevel(logging.INFO)


# -----------------------------
# Helpers: idempotency
# -----------------------------
def _idem_keys_from_record(rec: Dict[str, Any]) -> Tuple[str, str]:
    """
    Build idempotency keys from an S3-style record dict.
    Prefer VersionId; fall back to S3 'sequencer'; last resort 'null'.
    """
    b = rec["s3"]["bucket"]["name"]
    k = rec["s3"]["object"]["key"]
    ver = rec["s3"]["object"].get("versionId") or rec["s3"]["object"].get("sequencer") or "null"
    idem_pk = f"IDEMP#{b}/{k}"
    idem_sk = ver
    return idem_pk, idem_sk


def _claim_idempotency(idem_pk: str, idem_sk: str) -> bool:
    """
    Attempt to create an idempotency record. If it already exists, skip work.
    """
    try:
        ddb.put_item(
            Item={
                "PK": idem_pk,
                "SK": idem_sk,
                "type": "idempotency",
                "state": "INPROGRESS",
                "ts": int(time.time()),
            },
            ConditionExpression="attribute_not_exists(PK) AND attribute_not_exists(SK)",
        )
        return True
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            logger.info("Idempotency claim exists for %s %s; skipping.", idem_pk, idem_sk)
            return False
        raise


def _mark_done(idem_pk: str, idem_sk: str) -> None:
    ddb.update_item(
        Key={"PK": idem_pk, "SK": idem_sk},
        UpdateExpression="SET #st = :done, done_ts = :t",
        ExpressionAttributeNames={"#st": "state"},
        ExpressionAttributeValues={":done": "DONE", ":t": int(time.time())},
    )


def _release_claim(idem_pk: str, idem_sk: str) -> None:
    """
    Delete the in-progress claim so a retry can process again.
    Best-effort; don't mask the original error.
    """
    try:
        ddb.delete_item(Key={"PK": idem_pk, "SK": idem_sk})
    except Exception:
        pass


# -----------------------------
# Helpers: event normalization
# -----------------------------
def _records_from_event(event: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    """
    Normalize both EventBridge-delivered S3 events and direct S3 events
    into a list of S3-like record dicts with the shape our processor expects.
    """
    # EventBridge path (S3 -> EventBridge -> Rule -> Lambda)
    if "detail" in event and isinstance(event["detail"], dict) and "bucket" in event["detail"]:
        detail = event["detail"]
        rec = {
            "eventName": detail.get("eventName", "ObjectCreated:Put"),
            "s3": {
                "bucket": {"name": detail["bucket"]["name"]},
                "object": {
                    "key": detail["object"]["key"],
                    "versionId": detail["object"].get("version-id"),
                    "sequencer": detail.get("sequencer"),
                },
            },
        }
        return [rec]

    # Direct S3 event path
    if "Records" in event and isinstance(event["Records"], list):
        return event["Records"]

    # Nothing recognizable
    return []


# -----------------------------
# Core processing
# -----------------------------
def _is_image_content_type(ctype: str) -> bool:
    return (ctype or "").lower().startswith("image/")


def _read_object(bucket: str, key: str) -> Dict[str, Any]:
    """Wrapper so we can add logging and future range/stream handling here."""
    resp = s3.get_object(Bucket=bucket, Key=key)
    return resp


def _lower_meta(meta: Dict[str, str]) -> Dict[str, str]:
    return {str(k).lower(): v for k, v in (meta or {}).items()}


def _process_image_variants(img: Image.Image, base_out_prefix: str) -> Dict[str, str]:
    """
    Create JPEG thumbnails under images/<mediaId>/w{width}.jpg
    Return a dict like: { "w400": "<cdn>/images/.../w400.jpg", ... }
    """
    variants = {}
    for w in VARIANT_WIDTHS:
        im2 = img.copy()
        im2.thumbnail((w, 10000))  # preserve aspect; cap height generously
        out_key = f"{base_out_prefix}/w{w}.jpg"

        buf = io.BytesIO()
        im2.save(buf, "JPEG", quality=86)
        s3.put_object(Bucket=_BUCKET, Key=out_key, Body=buf.getvalue(), ContentType="image/jpeg")

        variants[f"w{w}"] = f"{CDN_BASE}/{out_key}"
    return variants


# Globals set per-invocation to reduce param passing noise
_BUCKET = None


def _process_records(records: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    processed = 0
    skipped = 0

    global _BUCKET

    for rec in records:
        try:
            event_name = rec.get("eventName", "")
            if not event_name.startswith("ObjectCreated:"):
                skipped += 1
                continue

            b = rec["s3"]["bucket"]["name"]
            k = rec["s3"]["object"]["key"]
            _BUCKET = b  # used by variant writer

            # Only process raw/ keys
            if not k.startswith("raw/"):
                skipped += 1
                continue

            # Idempotency: claim
            idem_pk, idem_sk = _idem_keys_from_record(rec)
            if not _claim_idempotency(idem_pk, idem_sk):
                skipped += 1
                continue

            try:
                # Fetch object & basic gating
                o = _read_object(b, k)
                ctype = o.get("ContentType") or ""
                if not _is_image_content_type(ctype):
                    # Not an image -> mark done to avoid re-processing this version
                    _mark_done(idem_pk, idem_sk)
                    skipped += 1
                    continue

                # Required upstream metadata
                meta = _lower_meta(o.get("Metadata") or {})
                pk, sk = meta.get("pk"), meta.get("sk")
                if not pk or not sk:
                    # Missing metadata -> mark done so retries don't loop forever
                    logger.warning("Missing pk/sk metadata on %s/%s; skipping.", b, k)
                    _mark_done(idem_pk, idem_sk)
                    skipped += 1
                    continue

                # Derive output prefix from your original logic
                # images/<mediaId>/w{w}.jpg  where mediaId is after '#'
                media_id = sk.split("#", 1)[1] if "#" in sk else sk
                out_prefix = f"images/{media_id}"

                # Load & process image
                body = o["Body"].read()
                img = Image.open(io.BytesIO(body)).convert("RGB")
                variants = _process_image_variants(img, out_prefix)

                # Update your media record
                ddb.update_item(
                    Key={"PK": pk, "SK": sk},
                    UpdateExpression="SET #s = :ready, variants.image = :v",
                    ExpressionAttributeNames={"#s": "status"},
                    ExpressionAttributeValues={":ready": "ready", ":v": variants},
                )

                # Success -> finalize idempotency
                _mark_done(idem_pk, idem_sk)
                processed += 1

            except Exception as inner:
                # Failure -> release claim so retry can reprocess
                _release_claim(idem_pk, idem_sk)
                raise inner

        except Exception as e:
            logger.exception("Failed processing record: %s", e)
            # continue to next record

    return {"processed": processed, "skipped": skipped}


# -----------------------------
# Lambda entrypoint
# -----------------------------
def lambda_handler(event, context):
    """
    Supports:
      - EventBridge (S3 -> EventBridge -> Rule -> Lambda)
      - Direct S3 notifications (if you ever switch back)
    """
    records = _records_from_event(event)
    if not records:
        logger.info("No recognizable records in event; nothing to do.")
        return {"processed": 0, "skipped": 0}

    result = _process_records(records)
    logger.info("Done. %s", result)
    return result
