import json, os, boto3, datetime, requests

s3   = boto3.client("s3")
HEADERS = {
    "User-Agent": "Utopium/1.0",
    "x-api-key": os.environ["FEEDUTOPIA_API_KEY"],
}

BUCKET  = os.environ["UPLOAD_BUCKET"]
FEED_API = "https://api.feedutopia.com/start-execution"

def lambda_handler(event, _ctx):
    data = json.loads(event.get("body", "{}"))

    required = ("accountName","title","backgroundType","spinningArtifact","key")
    missing  = [p for p in required if p not in data]
    if missing:
        return _bad(f"missing {missing}")

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
    return _ok({"status":"success","feedutopiaResponse":r.json()})

def _ok(b):  return {"statusCode":200,"headers":{"Access-Control-Allow-Origin":"*"},"body":json.dumps(b)}
def _bad(m): return {"statusCode":400,"headers":{"Access-Control-Allow-Origin":"*"},"body":json.dumps({"error":m})}
