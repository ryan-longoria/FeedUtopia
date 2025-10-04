from __future__ import annotations

import datetime as _dt
import hashlib
import logging
import re
import unicodedata
from typing import Final, Literal, Optional

LOGGER = logging.getLogger("wrestleutopia.media")

Actor = Literal["wrestler", "promoter"]
Kind = Literal["avatar", "logo"]

_CANONICAL_PREFIXES: Final[tuple[str, ...]] = (
    "public/wrestlers/",
    "public/promoters/",
    "raw/uploads/",
)

_SAFE_SEGMENT_RE: Final[re.Pattern[str]] = re.compile(r"[^A-Za-z0-9._-]+", re.ASCII)
_CONTROL_RE: Final[re.Pattern[str]] = re.compile(r"[\x00-\x1F\x7F]")
_MAX_SEG_LEN: Final[int] = 128
_MAX_KEY_LEN: Final[int] = 1024


def _hash_short(s: str) -> str:
    """Return a short, non-reversible hash for logging."""
    return hashlib.sha256(s.encode("utf-8")).hexdigest()[:8]


def _normalize_unicode(s: str) -> str:
    """Apply NFKC Unicode normalization for predictable comparisons."""
    return unicodedata.normalize("NFKC", s)


def _clean_segment(seg: str) -> str:
    """Sanitize a path segment by removing control characters and unsafe symbols."""
    seg = _normalize_unicode(seg)
    seg = _CONTROL_RE.sub("", seg)
    seg = seg.replace("\\", "/")
    seg = seg.replace("..", "")
    seg = seg.strip("/")
    seg = _SAFE_SEGMENT_RE.sub("-", seg)
    seg = re.sub(r"-{2,}", "-", seg).strip("-")
    if not seg:
        seg = "file"
    if len(seg) > _MAX_SEG_LEN:
        seg = seg[:_MAX_SEG_LEN]
    return seg


def _choose_bucket_root(actor: Actor, kind: Optional[Kind]) -> str:
    """Return canonical root folder based on actor and kind."""
    base = "wrestlers" if actor == "wrestler" else "promoters"
    leaf = "profiles" if kind in {"avatar", "logo"} else "gallery"
    return f"public/{base}/{leaf}"


def _safe_join(*parts: str) -> str:
    """Join path parts safely and enforce key length limits."""
    cleaned = [_clean_segment(p) for p in parts if p]
    key = "/".join(cleaned)
    if len(key) > _MAX_KEY_LEN:
        key = key[-_MAX_KEY_LEN:]
    return key


def _strip_s3_url(raw: str) -> Optional[str]:
    """Strip s3://bucket/ prefix and return the key."""
    if not raw.startswith("s3://"):
        return raw
    parts = raw.split("/", 3)
    if len(parts) >= 4 and parts[3]:
        return parts[3]
    return None


def _is_canonical(key: str) -> bool:
    """Return True if the key already uses a canonical prefix."""
    return key.startswith(_CANONICAL_PREFIXES)


def _basename(key: str) -> str:
    """Return sanitized filename from key."""
    return _clean_segment(key.rsplit("/", 1)[-1])


def _log_debug_normalized(raw: str, result: Optional[str], sub: Optional[str]) -> None:
    """Emit a debug log for normalization."""
    if not LOGGER.isEnabledFor(logging.DEBUG):
        return
    sub_tag = f"sub={_hash_short(sub)}" if sub else "sub=<none>"
    LOGGER.debug("media_key_normalized %s raw=%r -> %r", sub_tag, raw, result)


def _validate_actor(actor: str) -> Actor:
    """Validate actor value."""
    a = actor.strip().lower()
    if a not in {"wrestler", "promoter"}:
        raise ValueError(f"Invalid actor: {actor!r}")
    return a


def _normalize_media_key(
    raw: str,
    sub: str,
    actor: str,
    kind: Optional[Kind] = None,
) -> Optional[str]:
    """Normalize a media key or s3:// URL to a canonical layout."""
    if not raw:
        _log_debug_normalized(raw, None, sub)
        return None

    try:
        act: Actor = _validate_actor(actor)
    except ValueError as exc:
        LOGGER.error("invalid_actor sub=%s error=%s", _hash_short(sub) if sub else "<none>", exc)
        return None

    stripped = _strip_s3_url(str(raw).strip())
    if stripped is None:
        _log_debug_normalized(raw, None, sub)
        return None
    k = stripped

    if _is_canonical(k):
        canon = next((p for p in _CANONICAL_PREFIXES if k.startswith(p)), "")
        rest = k[len(canon):]
        if rest:
            head, sep, last = rest.rpartition("/")
            last_s = _basename(last)
            result = canon + (head + sep if head else "") + last_s
        else:
            result = canon.rstrip("/")
        _log_debug_normalized(raw, result, sub)
        return result

    if sub and k.startswith(f"profiles/{sub}/"):
        base = _choose_bucket_root(act, "avatar")
        tail = k.split(f"profiles/{sub}/", 1)[1]
        result = _safe_join(base, sub, tail)
        _log_debug_normalized(raw, result, sub)
        return result

    if sub and k.startswith(f"user/{sub}/"):
        base = _choose_bucket_root(act, None)
        tail = k.split(f"user/{sub}/", 1)[1]
        result = _safe_join(base, sub, tail)
        _log_debug_normalized(raw, result, sub)
        return result

    if sub and k.startswith(f"{sub}/"):
        tail = k.split(f"{sub}/", 1)[1]
        result = _safe_join("raw/uploads", sub, tail)
        _log_debug_normalized(raw, result, sub)
        return result

    if not sub:
        _log_debug_normalized(raw, None, sub)
        return None

    fname = _basename(k) or f"file-{int(_dt.datetime.utcnow().timestamp())}"
    result = _safe_join("raw/uploads", sub, fname)
    _log_debug_normalized(raw, result, sub)
    return result
