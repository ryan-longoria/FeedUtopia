import json, os, time, logging, boto3, requests
from botocore.exceptions import ClientError, BotoCoreError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s"
)
logger = logging.getLogger(__name__)

s3        = boto3.client("s3")
dynamodb  = boto3.resource("dynamodb")
BUCKET    = os.environ["UPLOAD_BUCKET"]
API_KEY   = os.environ["FEEDUTOPIA_API_KEY"]
NEWS_TBL  = os.environ["NEWS_TABLE"]

news_table = dynamodb.Table(NEWS_TBL)
FEED_API   = "https://api.feedutopia.com/start-execution"

HEADERS = {
    "User-Agent": "Utopium/1.0",
    "x-api-key":  API_KEY,
}

def cache_if_news(payload: dict, media_key: str) -> None:
    artifact = payload.get("spinningArtifact", "").upper()
    if artifact not in ("NEWS", "TRAILER"):
        logger.debug("Not a NEWS or TRAILER post — skipping DynamoDB cache")
        return

    record = {
        "spinningArtifact": artifact,
        "accountName":     payload["accountName"],
        "createdAt":       int(time.time()),
        "expiresAt":       int(time.time()) + 9 * 24 * 3600,
        "title":           payload["title"],
        "subtitle":        payload.get("description", ""),
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
def lambda_handler(event, _ctx):
    logger.info("Received event: %s", event)

    try:
        data = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError as err:
        logger.error("Body is not valid JSON: %s", err)
        return _bad("invalid JSON body")

    required = ("accountName","title","backgroundType","spinningArtifact","key")
    missing  = [f for f in required if f not in data]
    if missing:
        logger.warning("Missing fields: %s", missing)
        return _bad(f"missing {missing}")

    is_image   = data["backgroundType"] in ("image", "photo")
    path_field = "image_path" if is_image else "video_path"
    logger.debug("Path field resolved to %s", path_field)

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
        "accountName"      : data["accountName"],
        "title"            : data["title"],
        "spinningArtifact" : data["spinningArtifact"],
        "backgroundType"   : data["backgroundType"],
        path_field         : {
            "bucket": BUCKET,
            "key":    data["key"],
            "contentType": meta["ContentType"],
            "eTag":        meta["ETag"],
            "size":        meta["ContentLength"],
            "lastChangedTime": meta["LastModified"].isoformat(),
        },
    }
    for f in ("description","highlightWordsTitle","highlightWordsDescription"):
        if data.get(f):
            payload[f] = data[f]

    logger.info("Calling FeedUtopia /start-execution")
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

    logger.info("create_feed_post completed successfully")
    return _ok({"status":"success","feedutopiaResponse": res.json()})

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
