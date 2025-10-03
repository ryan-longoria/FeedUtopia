import json
import datetime

def _log(*args):
    print("[WU]", *[repr(a) for a in args])

def _jsonify(data):
    from decimal import Decimal
    if isinstance(data, Decimal):
        return int(data) if data % 1 == 0 else float(data)
    if isinstance(data, list):
        return [_jsonify(x) for x in data]
    if isinstance(data, dict):
        return {k: _jsonify(v) for k, v in data.items()}
    return data

def _json(event):
    try:
        return json.loads(event.get("body") or "{}")
    except Exception:
        return {}

def _path(event):
    return (event.get("rawPath") or "/").rstrip("/")

def _qs(event):
    return event.get("queryStringParameters") or {}

def _now_iso():
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

def _resp(status, body=None):
    return {
        "statusCode": status,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(_jsonify(body if body is not None else {})),
    }
