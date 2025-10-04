from __future__ import annotations


import logging
from typing import Any

from db.tables import ddb, T_WREST

LOGGER = logging.getLogger("wrestleutopia.db.wrestlers")

WRES_PK: list[str] | None = None


def _get_wrestler_pk() -> list[str]:
    global WRES_PK
    if WRES_PK is not None:
        return WRES_PK

    try:
        desc = ddb.meta.client.describe_table(TableName=T_WREST.name)
        WRES_PK = [k["AttributeName"] for k in desc["Table"]["KeySchema"]]
    except Exception as exc:  # noqa: BLE001
        WRES_PK = ["userId"]
        LOGGER.warning("describe_table_failed defaulting_pk=userId error=%s", exc)

    return WRES_PK


def _batch_get_wrestlers(ids: list[str], proj: str, ean: dict[str, str]) -> list[dict[str, Any]]:
    client = ddb.meta.client
    items: list[dict[str, Any]] = []

    # Try 2-key first
    req2 = {
        T_WREST.name: {
            "Keys": [{"userId": {"S": uid}, "role": {"S": "Wrestler"}} for uid in ids],
            "ProjectionExpression": proj,
            "ExpressionAttributeNames": ean,
            "ConsistentRead": False,
        }
    }
    try:
        resp = client.batch_get_item(RequestItems=req2)
        items += resp.get("Responses", {}).get(T_WREST.name, [])
        tries = 0
        while resp.get("UnprocessedKeys") and tries < 3:
            resp = client.batch_get_item(RequestItems=resp["UnprocessedKeys"])
            items += resp.get("Responses", {}).get(T_WREST.name, [])
            tries += 1

        if items:
            return items
    except Exception as exc:  # noqa: BLE001
        LOGGER.debug("batch_get_2key_failed falling_back_1key error=%s", exc)

    # Fallback to 1-key
    req1 = {
        T_WREST.name: {
            "Keys": [{"userId": {"S": uid}} for uid in ids],
            "ProjectionExpression": proj,
            "ExpressionAttributeNames": ean,
            "ConsistentRead": False,
        }
    }
    resp = client.batch_get_item(RequestItems=req1)
    items += resp.get("Responses", {}).get(T_WREST.name, [])
    tries = 0
    while resp.get("UnprocessedKeys") and tries < 3:
        resp = client.batch_get_item(RequestItems=resp["UnprocessedKeys"])
        items += resp.get("Responses", {}).get(T_WREST.name, [])
        tries += 1

    return items
