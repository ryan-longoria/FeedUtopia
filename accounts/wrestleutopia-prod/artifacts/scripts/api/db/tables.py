from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Dict, Final

import boto3
from botocore.config import Config as BotoConfig

from config import get_config

LOGGER: Final = logging.getLogger("wrestleutopia.db.tables")


@dataclass(frozen=True)
class Tables:
    """Immutable DynamoDB resource and table handles."""
    ddb: Any
    wrestlers: Any
    promoters: Any
    tryouts: Any
    apps: Any
    handles: Any


@lru_cache(maxsize=1)
def get_tables() -> Tables:
    """Return cached DynamoDB resource and tables."""
    cfg = get_config()
    boto_cfg = BotoConfig(
        region_name=cfg.aws_region,
        retries={"max_attempts": 10, "mode": "adaptive"},
        connect_timeout=3,
        read_timeout=8,
        tcp_keepalive=True,
        max_pool_connections=30,
        user_agent_extra="wrestleutopia/db",
    )
    try:
        ddb = boto3.resource("dynamodb", config=boto_cfg)
    except Exception as exc:  # noqa: BLE001
        LOGGER.error("ddb_resource_init_failed error=%s", exc)
        raise

    tables = Tables(
        ddb=ddb,
        wrestlers=ddb.Table(cfg.table_wrestlers),
        promoters=ddb.Table(cfg.table_promoters),
        tryouts=ddb.Table(cfg.table_tryouts),
        apps=ddb.Table(cfg.table_apps),
        handles=ddb.Table(cfg.table_handles),
    )

    LOGGER.info(
        "dynamodb_tables_ready region=%s tables=%s",
        cfg.aws_region,
        {
            "wrestlers": cfg.table_wrestlers,
            "promoters": cfg.table_promoters,
            "tryouts": cfg.table_tryouts,
            "apps": cfg.table_apps,
            "handles": cfg.table_handles,
        },
    )
    return tables


def verify_tables(existence_only: bool = True) -> Dict[str, str]:
    """Return table existence status for health/debug."""
    cfg = get_config()
    tables = get_tables()
    client = tables.ddb.meta.client

    to_check = {
        "wrestlers": cfg.table_wrestlers,
        "promoters": cfg.table_promoters,
        "tryouts": cfg.table_tryouts,
        "apps": cfg.table_apps,
        "handles": cfg.table_handles,
    }

    results: Dict[str, str] = {}
    for logical, name in to_check.items():
        try:
            desc = client.describe_table(TableName=name)
            if existence_only:
                results[logical] = "ok"
            else:
                t = desc.get("Table", {})
                results[logical] = f"ok status={t.get('TableStatus', 'UNKNOWN')}"
        except Exception as exc:  # noqa: BLE001
            LOGGER.error("table_verify_failed logical=%s name=%s error=%s", logical, name, exc)
            results[logical] = "missing_or_inaccessible"
    return results


_tables = get_tables()
ddb = _tables.ddb
T_WREST = _tables.wrestlers
T_PROMO = _tables.promoters
T_TRY = _tables.tryouts
T_APP = _tables.apps
T_HANDLES = _tables.handles

__all__ = [
    "Tables",
    "get_tables",
    "verify_tables",
    "ddb",
    "T_WREST",
    "T_PROMO",
    "T_TRY",
    "T_APP",
    "T_HANDLES",
]
