import os
import io
import re
import time
import json
import logging
from typing import Dict, Any, Iterable, Tuple, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from PIL import Image, UnidentifiedImageError, ImageFile

MAX_SRC_BYTES = int(os.getenv("MAX_SRC_BYTES", str(25 * 1024 * 1024)))
MAX_IMAGE_PIXELS = int(os.getenv("MAX_IMAGE_PIXELS", "75000000"))
FAILED_RETRY_SECS = int(os.getenv("FAILED_RETRY_SECS", "600"))

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
ImageFile.LOAD_TRUNCATED_IMAGES = False

_BOTO_CFG = Config(
    retries={"mode": "standard", "max_attempts": 5},
    read_timeout=15,
    connect_timeout=3,
)
s3 = boto3.client("s3", config=_BOTO_CFG)
ddb = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])

CDN_BASE = os.environ["CDN_BASE"]
VARIANT_WIDTHS = (400, 1200)
DDB_TTL_SECS = int(os.getenv("DDB_TTL_SECS", "7776000"))
SAFE_ID = re.compile(r"^[A-Za-z0-9:_#-]{1,120}$")
SAFE_MEDIA = re.compile(r"[^A-Za-z0-9_-]")

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logger = logging.getLogger("image_processor")
if not logger.handlers:
    logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO))
logger.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))


def jlog(level: int, msg: str, **fields) -> None:
    """Emit a structured JSON log entry."""
    logger.log(
        level,
        json.dumps({"msg": msg, "lvl": logging.getLevelName(level), **fields}),
    )


def _now() -> int:
    """Return current epoch seconds."""
    return int(time.time())


def _idem_keys_from_record(
    rec: Dict[str, Any]
) -> Tuple[str, str, Optional[str], str, str]:
    """Build idempotency keys and core identifiers from a record."""
    b = rec["s3"]["bucket"]["name"]
    k = rec["s3"]["object"]["key"]
    ver = rec["s3"]["object"].get("versionId") or rec["s3"]["object"].get(
        "sequencer"
    ) or "null"
    idem_pk = f"IDEMP#{b}/{k}"
    idem_sk = ver
    return idem_pk, idem_sk, rec["s3"]["object"].get("versionId"), b, k


def _claim_idempotency(pk: str, sk: str) -> bool:
    """Attempt to claim idempotency, allowing reclaim after a short FAILED window."""
    try:
        ddb.put_item(
            Item={
                "PK": pk,
                "SK": sk,
                "type": "idempotency",
                "state": "INPROGRESS",
                "ts": _now(),
                "ttl": _now() + DDB_TTL_SECS,
            },
            ConditionExpression=(
                "attribute_not_exists(PK) AND attribute_not_exists(SK)"
                " OR (#st = :failed AND #ts < :retry_before)"
            ),
            ExpressionAttributeNames={"#st": "state", "#ts": "ts"},
            ExpressionAttributeValues={
                ":failed": "FAILED",
                ":retry_before": _now() - FAILED_RETRY_SECS,
            },
        )
        return True
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            return False
        raise


def _mark_done(pk: str, sk: str, state: str, **meta) -> None:
    """Mark an idempotency row as DONE or FAILED with metadata."""
    ddb.update_item(
        Key={"PK": pk, "SK": sk},
        UpdateExpression="SET #st = :s, done_ts = :t, meta = :m",
        ExpressionAttributeNames={"#st": "state"},
        ExpressionAttributeValues={":s": state, ":t": _now(), ":m": meta},
    )


def _records_from_event(event: Dict[str, Any]) -> Iterable[Dict[str, Any]]:
    """Normalize EventBridge or direct S3 events into record dicts."""
    if isinstance(event.get("detail"), dict) and "bucket" in event["detail"]:
        d = event["detail"]
        return [
            {
                "eventName": d.get("eventName", "ObjectCreated:Put"),
                "s3": {
                    "bucket": {"name": d["bucket"]["name"]},
                    "object": {
                        "key": d["object"]["key"],
                        "versionId": d["object"].get("version-id"),
                        "sequencer": d.get("sequencer"),
                        "size": d["object"].get("size"),
                    },
                },
            }
        ]
    if isinstance(event.get("Records"), list):
        return event["Records"]
    return []


def _read_object(bucket: str, key: str, version_id: Optional[str]) -> Dict[str, Any]:
    """Read an S3 object, honoring VersionId when provided."""
    args = {"Bucket": bucket, "Key": key}
    if version_id:
        args["VersionId"] = version_id
    return s3.get_object(**args)


def _is_allowed_format(fmt: Optional[str]) -> bool:
    """Return True if the format is an allowed image type."""
    return fmt in {"JPEG", "PNG", "WEBP"}


def _safe_media_id(sk: str) -> str:
    """Derive and sanitize media identifier from SK."""
    mid = sk.split("#", 1)[1] if "#" in sk else sk
    mid = SAFE_MEDIA.sub("_", mid)[:80]
    return mid or "unknown"


def _process_image_variants(
    img: Image.Image, base_out_prefix: str, bucket: str
) -> Dict[str, str]:
    """Generate resized variants and return their CDN URLs."""
    out: Dict[str, str] = {}
    for w in VARIANT_WIDTHS:
        im2 = img.copy()
        im2.thumbnail((w, 10000))
        buf = io.BytesIO()
        im2.save(buf, "JPEG", quality=86, optimize=True)
        key = f"{base_out_prefix}/w{w}.jpg"
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=buf.getvalue(),
            ContentType="image/jpeg",
            CacheControl="public, max-age=31536000, immutable",
            ServerSideEncryption="AES256",
        )
        out[f"w{w}"] = f"{CDN_BASE}/{key}"
    return out


def _valid_event_source(event: Dict[str, Any]) -> bool:
    """Return True only for S3-origin EventBridge or direct S3 events."""
    if "detail" in event:
        return event.get("source") == "aws.s3"
    return bool(event.get("Records"))


def _process_records(records: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    """Process event records and generate variants."""
    processed = 0
    skipped = 0
    for rec in records:
        try:
            if not str(rec.get("eventName", "")).startswith("ObjectCreated:"):
                skipped += 1
                continue
            idem_pk, idem_sk, ver, bucket, key = _idem_keys_from_record(rec)
            size = int(rec["s3"]["object"].get("size") or 0)
            if not (key.startswith("raw/uploads/") or key.startswith("raw/")):
                skipped += 1
                continue
            if size and size > MAX_SRC_BYTES:
                _mark_done(idem_pk, idem_sk, "FAILED", reason="too_large", size=size)
                skipped += 1
                continue
            if not _claim_idempotency(idem_pk, idem_sk):
                skipped += 1
                continue
            try:
                obj = _read_object(bucket, key, ver)
                body = obj["Body"].read(MAX_SRC_BYTES + 1)
                if len(body) > MAX_SRC_BYTES:
                    _mark_done(idem_pk, idem_sk, "FAILED", reason="too_large_read")
                    skipped += 1
                    continue
                try:
                    raw = Image.open(io.BytesIO(body))
                    raw.verify()
                    probe = Image.open(io.BytesIO(body))
                    fmt = getattr(probe, "format", None)
                    img = probe.convert("RGB")
                    if not _is_allowed_format(fmt):
                        _mark_done(idem_pk, idem_sk, "FAILED", reason="not_image")
                        skipped += 1
                        continue
                except (UnidentifiedImageError, Image.DecompressionBombError) as e:
                    _mark_done(idem_pk, idem_sk, "FAILED", reason=type(e).__name__)
                    skipped += 1
                    continue
                meta = {str(k).lower(): v for k, v in (obj.get("Metadata") or {}).items()}
                pk = meta.get("pk")
                sk = meta.get("sk")
                if not pk or not sk or not SAFE_ID.fullmatch(pk) or not SAFE_ID.fullmatch(sk):
                    _mark_done(idem_pk, idem_sk, "FAILED", reason="bad_metadata")
                    skipped += 1
                    continue
                kind = (meta.get("kind") or meta.get("ownerkind") or "wrestler").lower()
                role_folder = "wrestlers" if kind == "wrestler" else "promoters"
                media_id = _safe_media_id(sk)
                out_prefix = f"public/{role_folder}/images/{media_id}"
                variants = _process_image_variants(img, out_prefix, bucket)
                ddb.update_item(
                    Key={"PK": pk, "SK": sk},
                    UpdateExpression="SET #s = :ready, variants.image = :v",
                    ConditionExpression="attribute_exists(PK) AND attribute_exists(SK)",
                    ExpressionAttributeNames={"#s": "status"},
                    ExpressionAttributeValues={":ready": "ready", ":v": variants},
                )
                _mark_done(
                    idem_pk,
                    idem_sk,
                    "DONE",
                    variants=list(variants.keys()),
                    bucket=bucket,
                    key=key,
                    version=ver or "null",
                    pk=pk,
                    sk=sk,
                )
                processed += 1
            except Exception as inner:
                _mark_done(idem_pk, idem_sk, "FAILED", reason=str(inner)[:200])
                raise
        except Exception as e:
            jlog(
                logging.ERROR,
                "record_failed",
                err=str(e)[:500],
                bucket=rec.get("s3", {}).get("bucket", {}).get("name"),
                key=rec.get("s3", {}).get("object", {}).get("key"),
            )
    return {"processed": processed, "skipped": skipped}


def lambda_handler(event, context):
    """AWS Lambda entry point for processing image uploads."""
    if not _valid_event_source(event):
        jlog(logging.INFO, "invalid_event_source")
        return {"processed": 0, "skipped": 0}
    recs = _records_from_event(event)
    if not recs:
        jlog(logging.INFO, "no_records")
        return {"processed": 0, "skipped": 0}
    res = _process_records(recs)
    jlog(logging.INFO, "done", **res)
    return res
