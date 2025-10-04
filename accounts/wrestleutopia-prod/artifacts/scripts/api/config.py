from __future__ import annotations
import os
import re
import hashlib
import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Final
from boto3.dynamodb.types import TypeSerializer, TypeDeserializer

MAX_BIO_LEN_DEFAULT: Final[int] = 1500
MAX_BIO_LEN_MIN: Final[int] = 50
MAX_BIO_LEN_MAX: Final[int] = 10_000

MAX_GIMMICKS_DEFAULT: Final[int] = 10
MAX_GIMMICKS_MIN: Final[int] = 0
MAX_GIMMICKS_MAX: Final[int] = 100

TABLE_NAME_RE: Final[re.Pattern[str]] = re.compile(r"^[A-Za-z0-9._\-]{3,255}$", re.ASCII)
UUID_PATH: Final[re.Pattern[str]] = re.compile(r"^/tryouts/[0-9a-fA-F-]{36}$", re.ASCII)
HANDLE_RE: Final[re.Pattern[str]] = re.compile(r"[^a-z0-9]+", re.ASCII)


def _env(name: str, *, default: str | None = None) -> str | None:
    """Return trimmed environment variable or default if not set."""
    val = os.environ.get(name)
    return val.strip() if val else default


def _require_env(name: str) -> str:
    """Fetch a required environment variable, raising on absence."""
    val = _env(name)
    if not val:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return val


def _parse_bool(name: str, default: bool = False) -> bool:
    """Parse a boolean environment variable strictly."""
    val = _env(name)
    if val is None:
        return default
    s = val.lower()
    if s in {"1", "true", "yes", "on"}:
        return True
    if s in {"0", "false", "no", "off"}:
        return False
    raise RuntimeError(f"Invalid boolean for {name!r}: {val!r}")


def _parse_int(name: str, default: int, min_v: int, max_v: int) -> int:
    """Parse a bounded integer from the environment; raise on invalid."""
    val = _env(name)
    if val is None or val == "":
        return default
    try:
        i = int(val)
    except ValueError as exc:
        raise RuntimeError(f"Invalid integer for {name!r}: {val!r}") from exc
    if not (min_v <= i <= max_v):
        raise RuntimeError(f"{name!r} out of range [{min_v}, {max_v}]: {i}")
    return i


def _validate_table(name_var: str) -> str:
    """Validate DynamoDB table name format and return it."""
    t = _require_env(name_var)
    if not TABLE_NAME_RE.match(t):
        raise RuntimeError(f"Env {name_var} contains invalid table name: {t!r}")
    return t


def _region(env: str) -> str:
    """Return AWS region, allowing fallback only in non-prod."""
    r = _env("AWS_REGION") or _env("AWS_DEFAULT_REGION")
    if not r:
        if env in {"dev", "development", "local", "sandbox", "test", "stage", "staging"}:
            return "us-east-2"
        raise RuntimeError("No AWS region provided (AWS_REGION/AWS_DEFAULT_REGION)")
    return r


def _log_level(env: str) -> str:
    """Return normalized log level (defaults to ERROR in prod, DEBUG otherwise)."""
    default = "ERROR" if env == "prod" else "DEBUG"
    lvl = (_env("LOG_LEVEL") or default).upper()
    if lvl not in {"CRITICAL", "ERROR", "WARNING", "INFO", "DEBUG"}:
        raise RuntimeError(f"Invalid LOG_LEVEL: {lvl!r}")
    return lvl


@dataclass(frozen=True)
class Config:
    """Immutable runtime configuration for the WrestleUtopia API."""

    environment: str
    aws_region: str
    log_level: str
    debug_tryouts: bool
    max_bio_len: int
    max_gimmicks: int
    table_wrestlers: str
    table_promoters: str
    table_tryouts: str
    table_apps: str
    table_handles: str
    uuid_path: re.Pattern[str]
    handle_re: re.Pattern[str]

    @property
    def serializer(self) -> TypeSerializer:
        """Return a DynamoDB TypeSerializer instance."""
        return TypeSerializer()

    @property
    def deserializer(self) -> TypeDeserializer:
        """Return a DynamoDB TypeDeserializer instance."""
        return TypeDeserializer()

    @property
    def is_prod(self) -> bool:
        """True if running in production environment."""
        return self.environment == "prod"

    @property
    def fingerprint(self) -> str:
        """Return non-secret config fingerprint for logging/audit."""
        parts = [
            f"env={self.environment}",
            f"region={self.aws_region}",
            f"log={self.log_level}",
            f"tables={self.table_wrestlers},{self.table_promoters},{self.table_tryouts},{self.table_apps},{self.table_handles}",
            f"limits={self.max_bio_len},{self.max_gimmicks}",
        ]
        return hashlib.sha256(",".join(parts).encode("utf-8")).hexdigest()[:16]


@lru_cache(maxsize=1)
def get_config() -> Config:
    """Load, validate, cache, and return the full configuration."""
    env = (_env("ENVIRONMENT") or "dev").strip().lower()
    if env not in {"dev", "development", "test", "stage", "staging", "prod", "local", "sandbox"}:
        raise RuntimeError(f"Invalid ENVIRONMENT: {env!r}")

    region = _region(env)
    log_level = _log_level(env)
    debug_tryouts = _parse_bool("DEBUG_TRYOUTS", default=False)

    if env == "prod" and debug_tryouts:
        raise RuntimeError("DEBUG_TRYOUTS must be disabled in production")

    max_bio_len = _parse_int("MAX_BIO_LEN", MAX_BIO_LEN_DEFAULT, MAX_BIO_LEN_MIN, MAX_BIO_LEN_MAX)
    max_gimmicks = _parse_int("MAX_GIMMICKS", MAX_GIMMICKS_DEFAULT, MAX_GIMMICKS_MIN, MAX_GIMMICKS_MAX)

    tw = _validate_table("TABLE_WRESTLERS")
    tp = _validate_table("TABLE_PROMOTERS")
    tt = _validate_table("TABLE_TRYOUTS")
    ta = _validate_table("TABLE_APPS")
    th = _validate_table("TABLE_HANDLES")

    config = Config(
        environment=env,
        aws_region=region,
        log_level=log_level,
        debug_tryouts=debug_tryouts,
        max_bio_len=max_bio_len,
        max_gimmicks=max_gimmicks,
        table_wrestlers=tw,
        table_promoters=tp,
        table_tryouts=tt,
        table_apps=ta,
        table_handles=th,
        uuid_path=UUID_PATH,
        handle_re=HANDLE_RE,
    )

    logging.basicConfig(
        level=getattr(logging, config.log_level, logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    logging.getLogger("wrestleutopia.config").info(
        "Configuration initialized fingerprint=%s", config.fingerprint
    )

    return config
