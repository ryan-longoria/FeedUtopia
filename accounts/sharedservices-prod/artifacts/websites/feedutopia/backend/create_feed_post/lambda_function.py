import json, os, boto3, time, requests, logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

s3   = boto3.client("s3")
HEADERS = {
    "User-Agent": "Utopium/1.0",
    "x-api-key": os.environ["FEEDUTOPIA_API_KEY"],
}

BUCKET  = os.environ["UPLOAD_BUCKET"]
FEED_API = "https://api.feedutopia.com/start-execution"

dynamodb = boto3.resource("dynamodb")
news_table = dynamodb.Table(os.environ["NEWS_TABLE"])

def cache_if_news(payload: dict, media_key: str) -> None:
    if payload.get("spinningArtifact") != "NEWS":
        return

    now = int(time.time())
    record = {
        "accountName":  payload["accountName"],
        "createdAt":    now,
        "expiresAt":    now + 9 * 24 * 3600,
        "title":        payload["title"],
        "subtitle":     payload.get("description", ""),
        "highlightWordsTitle":       payload.get("highlightWordsTitle", ""),
        "highlightWordsDescription": payload.get("highlightWordsDescription", ""),
        "backgroundType": payload.get("backgroundType", "image"),
        "s3Bucket": BUCKET,
        "s3Key":    media_key,
    }
    try:
        news_table.put_item(Item=record)
    except Exception as e:
        print("PutItem failed", e)
        raise

def lambda_handler(event, _ctx):
    data = json.loads(event.get("body", "{}"))

    required = ("accountName","title","backgroundType","spinningArtifact","key")
    missing  = [p for p in required if p not in data]
    if missing:
        return _bad(f"missing {missing}")
    
    is_image   = data["backgroundType"] in ("image", "photo")
    path_field = "image_path" if is_image else "video_path"

    meta = s3.head_object(Bucket=BUCKET, Key=data["key"])
    path_field = "image_path" if data["backgroundType"]=="photo" else "video_path"

    payload = {
        "accountName"      : data["accountName"],
        "title"            : data["title"],
        "spinningArtifact" : data["spinningArtifact"],
        "backgroundType"   : data["backgroundType"],
        path_field         : {
            "bucket"         : BUCKET,
            "key"            : data["key"],
            "contentType"    : meta["ContentType"],
            "eTag"           : meta["ETag"],
            "size"           : meta["ContentLength"],
            "lastChangedTime": meta["LastModified"].isoformat()
        }
    }
    for f in ("description","highlightWordsTitle","highlightWordsDescription"):
        if f in data and data[f]:
            payload[f] = data[f]

    r = requests.post(FEED_API, json=payload, headers=HEADERS, timeout=10)
    r.raise_for_status()
    cache_if_news(payload, media_key=data["key"])
    return _ok({"status":"success","feedutopiaResponse":r.json()})

def _ok(b):  return {"statusCode":200,"headers":{"Access-Control-Allow-Origin":"*"},"body":json.dumps(b)}
def _bad(m): return {"statusCode":400,"headers":{"Access-Control-Allow-Origin":"*"},"body":json.dumps({"error":m})}
