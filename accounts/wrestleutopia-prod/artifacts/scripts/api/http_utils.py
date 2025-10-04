from __future__ import annotations
import base64
import datetime as dt
import json
import logging
import os
from decimal import Decimal
from typing import Any, Dict, Mapping, MutableMapping, Optional
from config import get_config

LOGGER = logging.getLogger("wrestleutopia.http")


def _parse_int(env: str, default: int, min_v: int, max_v: int) -> int:
    """Parse an integer environment variable with bounds validation."""
    val = os.environ.get(env)
    if val is None or val.strip() == "":
        return default
    i = int(val)
    if not (min_v <= i <= max_v):
        raise RuntimeError(f"{env!r} out of range [{min_v}, {max_v}]: {i}")
    return i


MAX_JSON_BODY_BYTES: int = _parse_int(
    "MAX_JSON_BODY_BYTES", default=1_048_576, min_v=1_024, max_v=8_388_608
)
CORS_ALLOW_ORIGIN = os.environ.get("CORS_ALLOW_ORIGIN", "").strip()
CORS_ALLOW_HEADERS = os.environ.get(
    "CORS_ALLOW_HEADERS", "content-type,authorization"
).strip()
CORS_ALLOW_METHODS = os.environ.get(
    "CORS_ALLOW_METHODS", "GET,POST,PUT,PATCH,DELETE,OPTIONS"
).strip()


def _safe_len(buf: Any) -> int:
    """Return byte length of a str or bytes object."""
    if isinstance(buf, bytes):
        return len(buf)
    if isinstance(buf, str):
        return len(buf.encode("utf-8", errors="ignore"))
    return 0


def _json_default(o: Any) -> Any:
    """JSON encoder default that converts Decimal to int or float."""
    if isinstance(o, Decimal):
        return int(o) if o % 1 == 0 else float(o)
    raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")


def request_method(event: Mapping[str, Any]) -> str:
    """Return the HTTP method from the Lambda proxy event."""
    return (
        event.get("requestContext", {}).get("http", {}).get("method", "GET")
    ).upper()


def request_path(event: Mapping[str, Any]) -> str:
    """Return normalized request path without trailing slash."""
    return (event.get("rawPath") or "/").rstrip("/")


def request_query(event: Mapping[str, Any]) -> Dict[str, str]:
    """Return query-string parameters dictionary."""
    return event.get("queryStringParameters") or {}


def request_id(event: Mapping[str, Any]) -> Optional[str]:
    """Return the request identifier if available."""
    rc = event.get("requestContext", {}) or {}
    return rc.get("requestId") or rc.get("requestId")


def now_iso() -> str:
    """Return current UTC timestamp in ISO-8601 Z format."""
    return (
        dt.datetime.now(tz=dt.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def parse_json_body(event: Mapping[str, Any]) -> Dict[str, Any]:
    """Parse JSON body from the API Gateway event, respecting base64 and size limits."""
    try:
        raw = event.get("body") or ""
        is_b64 = bool(event.get("isBase64Encoded"))
        if is_b64:
            if _safe_len(raw) > MAX_JSON_BODY_BYTES * 2:
                LOGGER.warning("json_b64_body_too_large")
                return {}
            raw_bytes = base64.b64decode(raw, validate=True)
            if len(raw_bytes) > MAX_JSON_BODY_BYTES:
                LOGGER.warning("json_body_too_large")
                return {}
            text = raw_bytes.decode("utf-8", errors="strict")
        else:
            if _safe_len(raw) > MAX_JSON_BODY_BYTES:
                LOGGER.warning("json_body_too_large")
                return {}
            text = raw if isinstance(raw, str) else ""
        if not text:
            return {}
        return json.loads(text)
    except Exception as exc:
        LOGGER.info("json_parse_error err=%s", exc)
        return {}


def jsonify(data: Any) -> Any:
    """Recursively convert unsupported JSON types like Decimal."""
    if isinstance(data, Decimal):
        return int(data) if data % 1 == 0 else float(data)
    if isinstance(data, list):
        return [jsonify(x) for x in data]
    if isinstance(data, dict):
        return {k: jsonify(v) for k, v in data.items()}
    return data


def json_response(
    status: int,
    body: Any = None,
    *,
    headers: Optional[Mapping[str, str]] = None,
    cors: bool = False,
) -> Dict[str, Any]:
    """Return an API Gateway–compatible JSON response with consistent headers."""
    base_headers: MutableMapping[str, str] = {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
    }
    if cors and CORS_ALLOW_ORIGIN:
        base_headers.update(
            {
                "access-control-allow-origin": CORS_ALLOW_ORIGIN,
                "access-control-allow-headers": CORS_ALLOW_HEADERS,
                "access-control-allow-methods": CORS_ALLOW_METHODS,
            }
        )
    if headers:
        for k, v in headers.items():
            if k.lower() not in base_headers:
                base_headers[k] = v
    payload = {} if body is None else body
    try:
        body_str = json.dumps(
            jsonify(payload),
            ensure_ascii=False,
            separators=(",", ":"),
            default=_json_default,
        )
    except TypeError:
        body_str = json.dumps({"message": "Serialization error"})
    LOGGER.debug("json_response status=%s", status)
    return {
        "statusCode": int(status),
        "headers": dict(base_headers),
        "body": body_str,
    }


def _json(event: Dict[str, Any]) -> Dict[str, Any]:
    """Backward compatibility alias for parse_json_body()."""
    return parse_json_body(event)


def _path(event: Dict[str, Any]) -> str:
    """Backward compatibility alias for request_path()."""
    return request_path(event)


def _qs(event: Dict[str, Any]) -> Dict[str, str]:
    """Backward compatibility alias for request_query()."""
    return request_query(event)


def _now_iso() -> str:
    """Backward compatibility alias for now_iso()."""
    return now_iso()


def _resp(status: int, body: Any = None) -> Dict[str, Any]:
    """Backward compatibility alias for json_response()."""
    return json_response(status, body)
