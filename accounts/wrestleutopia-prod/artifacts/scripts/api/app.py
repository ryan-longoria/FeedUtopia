from __future__ import annotations

import logging
import re
from time import perf_counter

from boto3.dynamodb.conditions import Key
from botocore.exceptions import BotoCoreError, ClientError
from auth import _claims, _is_promoter, _is_wrestler
from config import get_config
from db.tables import T_WREST
from http_utils import _now_iso, _path, _qs, _resp
from routes import applications as r_apps
from routes.tryouts import _get_tryouts, _get_open_tryouts_by_owner
from routes import promoters as r_promoters
from routes import tryouts as r_tryouts
from routes import wrestlers as r_wrestlers

cfg = get_config()
LOGGER = logging.getLogger("wrestleutopia.app")

SAFE_PATH_RE = re.compile(r"^[A-Za-z0-9/_\-.]+$")
MAX_BODY_BYTES = 1_000_000
ALLOW_PUBLIC = set()


def _normalize_method(event: dict) -> str:
    """Return the HTTP method (normalized to uppercase)."""
    return (
        event.get("requestContext", {})
        .get("http", {})
        .get("method", "GET")
        .upper()
        .strip()
    )


def _require_member(groups: set[str]):
    """Allow either Wrestler or Promoter."""
    if not (_is_wrestler(groups) or _is_promoter(groups)):
        return _resp(403, {"message": "Wrestler or promoter role required"})
    return None


def _request_ids(event: dict) -> dict:
    """Extract request/trace identifiers for correlation in logs and responses."""
    rc = event.get("requestContext", {}) or {}
    headers = event.get("headers", {}) or {}
    return {
        "requestId": rc.get("requestId") or rc.get("awsRequestId") or "",
        "traceId": headers.get("x-amzn-trace-id", ""),
    }


def _body_too_large(event: dict) -> bool:
    """Return True if the raw body exceeds MAX_BODY_BYTES."""
    body = event.get("body")
    return isinstance(body, str) and len(body) > MAX_BODY_BYTES


def _bad_path(path: str) -> bool:
    """Reject malformed or traversal-like paths."""
    return (not path) or (not SAFE_PATH_RE.match(path))


def _require_promoter(groups: set[str]):
    """Enforce Promoter role; return an HTTP response if unauthorized."""
    if not _is_promoter(groups):
        return _resp(403, {"message": "Promoter role required"})
    return None


def _require_wrestler(groups: set[str]):
    """Enforce Wrestler role; return an HTTP response if unauthorized."""
    if not _is_wrestler(groups):
        return _resp(403, {"message": "Wrestler role required"})
    return None


def _uuid_from_tail(path: str) -> str | None:
    """Extract a UUID from a /tryouts/{uuid} path using the strict regex."""
    if cfg.uuid_path.fullmatch(path):
        return path.rsplit("/", 1)[1]
    return None


def _access_log(method: str, path: str, status: int, t_start: float, ids: dict) -> None:
    """Emit a single-line access log with latency and correlation IDs."""
    try:
        latency_ms = int((perf_counter() - t_start) * 1000)
        LOGGER.info(
            "access",
            extra={
                "method": method,
                "path": path,
                "status": status,
                "latency_ms": latency_ms,
                "requestId": ids.get("requestId", ""),
                "traceId": ids.get("traceId", ""),
                "env": cfg.environment,
            },
        )
    except Exception:
        pass


def lambda_handler(event, _ctx):
    """Main Lambda entrypoint and lightweight HTTP router."""
    t0 = perf_counter()
    ids = _request_ids(event)
    method = _normalize_method(event)
    raw_path = _path(event)

    try:
        if method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}:
            resp = _resp(405, {"message": "Method not allowed", **ids})
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        if _bad_path(raw_path):
            resp = _resp(400, {"message": "Malformed path", **ids})
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        if method == "OPTIONS":
            resp = {
                "statusCode": 204,
                "headers": {"content-type": "application/json"},
                "body": "",
            }
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        if _body_too_large(event):
            resp = _resp(413, {"message": "Payload too large", **ids})
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        sub, groups = _claims(event)
        if not sub:
            resp = _resp(401, {"message": "Unauthorized", **ids})
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp
        
        if method == "GET" and raw_path == "/tryouts":
            err = _require_member(groups)
            resp = err or r_tryouts._get_tryouts(event)
            resp.setdefault("headers", {}).update({"X-Request-Id": ids["requestId"]})
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        if method == "GET":
            if cfg.uuid_path.fullmatch(raw_path):
                tryout_id = raw_path.rsplit("/", 1)[1]
                resp = r_tryouts._get_tryout(tryout_id)
                resp.setdefault("headers", {}).update({"X-Request-Id": ids["requestId"]})
                _access_log(method, raw_path, resp["statusCode"], t0, ids)
                return resp

            if raw_path.startswith("/profiles/wrestlers/") and raw_path != "/profiles/wrestlers/me":
                handle = raw_path.split("/")[-1]
                resp = r_wrestlers._get_profile_by_handle(handle)
                resp.setdefault("headers", {}).update({"X-Request-Id": ids["requestId"]})
                _access_log(method, raw_path, resp["statusCode"], t0, ids)
                return resp

            if raw_path.startswith("/profiles/promoters/") and raw_path != "/profiles/promoters/me":
                user_id = raw_path.split("/")[-1]
                resp = r_promoters._get_promoter_public(user_id)
                resp.setdefault("headers", {}).update({"X-Request-Id": ids["requestId"]})
                _access_log(method, raw_path, resp["statusCode"], t0, ids)
                return resp

            if raw_path.startswith("/promoters/") and raw_path.endswith("/tryouts"):
                user_id = raw_path.split("/")[2]
                resp = r_tryouts._get_open_tryouts_by_owner(user_id)
                resp.setdefault("headers", {}).update({"X-Request-Id": ids["requestId"]})
                _access_log(method, raw_path, resp["statusCode"], t0, ids)
                return resp

        sub, groups = _claims(event)
        if not sub:
            resp = _resp(401, {"message": "Unauthorized", **ids})
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        if raw_path == "/health":
            resp = _resp(200, {"ok": True, "time": _now_iso(), **ids})
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        if method == "GET" and raw_path == "/profiles/wrestlers/me":
            item = T_WREST.get_item(Key={"userId": sub}).get("Item") or {}
            item.setdefault("mediaKeys", [])
            item.setdefault("highlights", [])
            resp = _resp(200, {**item, **ids})
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        if method == "PUT" and raw_path == "/profiles/wrestlers/me":
            err = _require_wrestler(groups)
            resp = err or r_wrestlers._put_me_profile(sub, groups, event)
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        if raw_path.startswith("/profiles/wrestlers") and method in {"POST", "PATCH"}:
            err = _require_wrestler(groups)
            resp = err or r_wrestlers._upsert_wrestler_profile(sub, groups, event)
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        if method == "GET" and raw_path == "/profiles/wrestlers":
            if _is_promoter(groups):
                resp = r_wrestlers._list_wrestlers(groups, event)
                _access_log(method, raw_path, resp["statusCode"], t0, ids)
                return resp
            if _is_wrestler(groups):
                item = T_WREST.get_item(Key={"userId": sub}).get("Item") or {}
                item.setdefault("mediaKeys", [])
                item.setdefault("highlights", [])
                resp = _resp(200, {**item, **ids})
                _access_log(method, raw_path, resp["statusCode"], t0, ids)
                return resp
            resp = _resp(403, {"message": "Wrestler or promoter role required", **ids})
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        if method == "GET" and raw_path == "/profiles/promoters/me":
            resp = r_promoters._get_promoter_profile(sub)
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        if method == "GET" and raw_path == "/profiles/promoters":
            resp = r_promoters._list_promoters(groups, event)
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        if raw_path.startswith("/profiles/promoters") and method in {"PUT", "POST", "PATCH"}:
            err = _require_promoter(groups)
            resp = err or r_promoters._upsert_promoter_profile(sub, groups, event)
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        if method == "POST" and raw_path == "/tryouts":
            err = _require_promoter(groups)
            resp = err or r_tryouts._post_tryout(sub, groups, event)
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        if method == "GET" and raw_path == "/tryouts/mine":
            err = _require_promoter(groups)
            if err:
                _access_log(method, raw_path, err["statusCode"], t0, ids)
                return err
            from db.tables import T_TRY
            try:
                result = T_TRY.query(
                    IndexName="ByOwner",
                    KeyConditionExpression=Key("ownerId").eq(sub),
                    ScanIndexForward=False,
                    Limit=100,
                )
                resp = _resp(200, {**ids, "items": result.get("Items", [])})
            except (ClientError, BotoCoreError) as exc:
                LOGGER.error("tryouts.mine.query_failed err=%s", exc, extra=ids)
                resp = _resp(500, {"message": "Server error", **ids})
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        if method == "DELETE" and raw_path.startswith("/tryouts/"):
            tryout_id = _uuid_from_tail(raw_path)
            if not tryout_id:
                resp = _resp(400, {"message": "Invalid tryout id", **ids})
                _access_log(method, raw_path, resp["statusCode"], t0, ids)
                return resp
            resp = r_tryouts._delete_tryout(sub, tryout_id)
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        if raw_path == "/applications":
            if method == "POST":
                err = _require_wrestler(groups)
                resp = err or r_apps._post_application(sub, groups, event)
                _access_log(method, raw_path, resp["statusCode"], t0, ids)
                return resp
            if method == "GET":
                resp = r_apps._get_applications(sub, event)
                _access_log(method, raw_path, resp["statusCode"], t0, ids)
                return resp
            resp = _resp(405, {"message": "Method not allowed", **ids})
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        if cfg.debug_tryouts and method == "GET" and raw_path == "/debug/tryouts":
            resp = r_tryouts._debug_tryouts()
            _access_log(method, raw_path, resp["statusCode"], t0, ids)
            return resp

        resp = _resp(404, {"message": "Route not found", **ids})
        _access_log(method, raw_path, resp["statusCode"], t0, ids)
        return resp

    except Exception as exc:
        LOGGER.error(
            "unhandled",
            extra={
                "requestId": ids.get("requestId", ""),
                "traceId": ids.get("traceId", ""),
                "err": str(exc),
            },
        )
        resp = _resp(500, {"message": "Server error", **ids})
        _access_log(method, raw_path, resp["statusCode"], t0, ids)
        return resp
