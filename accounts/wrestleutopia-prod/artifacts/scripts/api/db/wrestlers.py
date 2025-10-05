from __future__ import annotations

import random
import time
from dataclasses import dataclass
from typing import Any, Iterable, Iterator, Sequence

from botocore.exceptions import BotoCoreError, ClientError

from config import get_config
from log import get_logger
from db.tables import ddb, T_WREST

_LOG = get_logger("db.wrestlers")
_CFG = get_config()

_MAX_KEYS_PER_BATCH = 100
_MAX_TOTAL_KEYS = 10000
_MAX_RETRIES = 5
_BACKOFF_BASE = 0.15
_BACKOFF_CAP = 2.0


@dataclass(frozen=True)
class _KeySchema:
    """Minimal key schema descriptor for deciding 1-key vs 2-key BatchGet."""
    has_userid: bool
    has_role: bool


def _chunked(seq: Sequence[str], size: int) -> Iterator[Sequence[str]]:
    """Yield fixed-size chunks from a sequence."""
    for i in range(0, len(seq), size):
        yield seq[i: i + size]


def _build_projection_expression(allowed_fields: Iterable[str]) -> tuple[str, dict[str, str]]:
    """Return a safe ProjectionExpression and ExpressionAttributeNames from a field allowlist."""
    fields = list({f for f in allowed_fields if f and isinstance(f, str)})
    if not fields:
        fields = ["userId", "handle", "stageName", "name", "city", "region", "photoKey"]
    ean = {f"#f{i}": f for i, f in enumerate(fields)}
    proj = ", ".join(ean.keys())
    return proj, ean


def _describe_wrestlers_schema() -> _KeySchema:
    """Describe the Wrestlers table and return key schema info."""
    try:
        desc = ddb.meta.client.describe_table(TableName=T_WREST.name)
        ks = {k["AttributeName"] for k in desc["Table"]["KeySchema"]}
        has_userid = "userId" in ks
        has_role = "role" in ks
        if not has_userid:
            _LOG.error("wrestlers_schema_missing_userId key_schema=%s", list(ks))
        return _KeySchema(has_userid=has_userid, has_role=has_role)
    except Exception as exc:  # noqa: BLE001
        _LOG.warning("describe_table_failed defaulting=userId_only error=%s", exc)
        return _KeySchema(has_userid=True, has_role=False)


def get_wrestler_pk() -> list[str]:
    """Return Wrestlers table primary key attributes."""
    ks = _describe_wrestlers_schema()
    if ks.has_userid and ks.has_role:
        return ["userId", "role"]
    return ["userId"]


def batch_get_wrestlers(
    ids: list[str],
    *,
    allowed_fields: Iterable[str] | None = None,
    consistent_read: bool = False,
) -> list[dict[str, Any]]:
    """Retrieve wrestler items by userId in safe, chunked BatchGet calls."""
    if not ids:
        return []

    ids = list(dict.fromkeys([i for i in ids if i]))
    if not ids:
        return []

    if len(ids) > _MAX_TOTAL_KEYS:
        raise RuntimeError(f"Too many ids: {len(ids)} > safety cap ({_MAX_TOTAL_KEYS})")

    proj, ean = _build_projection_expression(allowed_fields or [])
    ks = _describe_wrestlers_schema()
    client = ddb.meta.client
    results: list[dict[str, Any]] = []

    def _make_key(uid: str) -> dict[str, dict[str, str]]:
        key = {"userId": {"S": uid}}
        if ks.has_role:
            key["role"] = {"S": "Wrestler"}
        return key

    for chunk in _chunked(ids, _MAX_KEYS_PER_BATCH):
        request_items = {
            T_WREST.name: {
                "Keys": [_make_key(uid) for uid in chunk],
                "ProjectionExpression": proj,
                "ExpressionAttributeNames": ean,
                "ConsistentRead": bool(consistent_read),
            }
        }

        tries = 0
        while True:
            try:
                resp = client.batch_get_item(RequestItems=request_items)
            except (ClientError, BotoCoreError) as exc:
                _LOG.error("batch_get_item_failed count=%d error=%s", len(chunk), exc)
                raise

            got = resp.get("Responses", {}).get(T_WREST.name, [])
            if got:
                results.extend(got)

            unprocessed = resp.get("UnprocessedKeys") or {}
            if not unprocessed or T_WREST.name not in unprocessed:
                break

            tries += 1
            if tries > _MAX_RETRIES:
                _LOG.warning(
                    "unprocessed_keys_exhausted chunk=%d returned=%d remaining=%d",
                    len(chunk),
                    len(got),
                    len(unprocessed[T_WREST.name].get("Keys", [])),
                )
                break

            sleep = min(_BACKOFF_CAP, _BACKOFF_BASE * (2 ** (tries - 1)))
            sleep *= random.uniform(0.75, 1.25)
            _LOG.debug("retrying_unprocessed_keys attempt=%d sleep=%.3fs", tries, sleep)
            time.sleep(sleep)

            request_items = unprocessed

    _LOG.info(
        "batch_get_wrestlers_completed input=%d fetched=%d schema=%s",
        len(ids),
        len(results),
        "userId,role" if ks.has_role else "userId",
    )
    return results