from __future__ import annotations

import json
import logging
import os
import re
import time
from typing import Any, Dict, FrozenSet, Iterable, Mapping, Optional, Set, Tuple

LOGGER = logging.getLogger("wrestleutopia.auth")

EXPECTED_ISS = (os.getenv("JWT_EXPECTED_ISS") or "").rstrip("/")
EXPECTED_AUDS: FrozenSet[str] = frozenset(
    a.strip() for a in (os.getenv("JWT_EXPECTED_AUDS") or "").split(",") if a.strip()
)
ALLOW_ROLE_INFERENCE = (os.getenv("ALLOW_ROLE_INFERENCE") or "").lower() in {"1", "true", "yes"}
MAX_GROUPS = int(os.getenv("MAX_GROUPS", "50"))
MAX_GROUP_LEN = int(os.getenv("MAX_GROUP_LEN", "64"))

ALLOWED_GROUPS = frozenset({"wrestlers", "promoters"})
WRESTLERS = "wrestlers"
PROMOTERS = "promoters"

_COMMA_WS = re.compile(r"[,\s]+")
_JSON_ARRAY_PREFIX = "["


def _safe_now_epoch(event: Dict[str, Any]) -> int:
    """Return the current epoch seconds, preferring API Gateway's timeEpoch when available."""
    t = event.get("requestContext", {}).get("timeEpoch")
    if isinstance(t, (int, float)):
        return int(t / 1000) if t > 10_000_000_000 else int(t)
    return int(time.time())


def _lc(s: Any) -> str:
    """Return a lowercased, trimmed string representation of the input."""
    return str(s).strip().lower()


def _clean_groups(groups: Iterable[str]) -> FrozenSet[str]:
    """Normalize and bound groups against an allow-list and size limits."""
    out: Set[str] = set()
    for g in groups:
        if not g:
            continue
        gl = _lc(g)
        if len(gl) > MAX_GROUP_LEN:
            continue
        if gl in ALLOWED_GROUPS:
            out.add(gl)
    if len(out) > MAX_GROUPS:
        out = set(list(out)[:MAX_GROUPS])
    return frozenset(out)


def _parse_groups_from_claim(value: Any) -> Set[str]:
    """Parse groups from list or string; tolerates stringified JSON arrays."""
    gs: Set[str] = set()
    if isinstance(value, list):
        for x in value:
            if x:
                gs.add(str(x))
        return gs
    if isinstance(value, str):
        s = value.strip()
        if s.startswith(_JSON_ARRAY_PREFIX):
            try:
                arr = json.loads(s)
                if isinstance(arr, list):
                    for x in arr:
                        if x:
                            gs.add(str(x))
            except Exception:
                pass
        if not gs:
            for part in _COMMA_WS.split(s):
                if part:
                    gs.add(part)
    return gs


def _basic_token_checks(claims: Mapping[str, Any], now_epoch: int) -> Optional[str]:
    """Validate iss/aud/token_use/exp/nbf; return None if valid or reason if invalid."""
    iss = str(claims.get("iss") or "").rstrip("/")
    if EXPECTED_ISS and iss != EXPECTED_ISS:
        return "bad_iss"

    aud = str(claims.get("aud") or "")
    client_id = str(claims.get("client_id") or "")
    if EXPECTED_AUDS and (aud not in EXPECTED_AUDS and client_id not in EXPECTED_AUDS):
        return "bad_aud"

    tu = _lc(claims.get("token_use") or "")
    if tu not in {"id", "access"}:
        return "bad_token_use"

    skew = 120
    try:
        exp = int(claims.get("exp"))
        if now_epoch > exp + skew:
            return "expired"
    except Exception:
        return "no_exp"

    try:
        nbf = int(claims.get("nbf", 0))
        if nbf and now_epoch + skew < nbf:
            return "nbf_in_future"
    except Exception:
        pass

    return None


def _extract_claims(event: Dict[str, Any]) -> Mapping[str, Any]:
    """Extract and normalize claim keys from API Gateway authorizer context."""
    rc = event.get("requestContext") or {}
    authz = rc.get("authorizer") or {}

    jwt_ctx = authz.get("jwt") or {}
    claims = jwt_ctx.get("claims") or {}

    if not claims and isinstance(authz.get("claims"), dict):
        claims = authz["claims"]

    return {str(k).lower(): v for k, v in (claims.items() if isinstance(claims, dict) else [])}


def _subject_from(claims: Mapping[str, Any]) -> Optional[str]:
    """Derive the subject identifier from common Cognito claim keys."""
    return claims.get("sub") or claims.get("username") or claims.get("cognito:username")


def _groups_from(claims: Mapping[str, Any]) -> FrozenSet[str]:
    """Derive normalized groups from claims, with optional inference from custom role or scopes."""
    groups: Set[str] = set()

    candidates: Iterable[Any] = []
    if claims:
        vals: list[Any] = []
        for k, v in claims.items():
            kl = str(k).lower()
            if (
                kl == "cognito:groups"
                or kl == "groups"
                or kl.endswith("/groups")
                or kl.endswith(":groups")
            ):
                vals.append(v)
        candidates = vals

    for val in candidates:
        groups |= _parse_groups_from_claim(val)

    if ALLOW_ROLE_INFERENCE:
        role = _lc(claims.get("custom:role") or claims.get("role") or "")
        if role.startswith("wrestler"):
            groups.add(WRESTLERS)
        elif role.startswith("promoter"):
            groups.add(PROMOTERS)

    return _clean_groups(groups)


def _claims(event: Dict[str, Any]) -> Tuple[Optional[str], FrozenSet[str]]:
    """Return (subject, groups) from the request event or (None, empty) if invalid."""
    claims = _extract_claims(event)
    if not claims:
        LOGGER.info("auth.miss: no claims present")
        return None, frozenset()

    now = _safe_now_epoch(event)
    reason = _basic_token_checks(claims, now)
    if reason is not None:
        if LOGGER.isEnabledFor(logging.DEBUG):
            LOGGER.debug(
                "auth.reject: %s | iss=%s aud=%s client_id=%s",
                reason,
                claims.get("iss"),
                claims.get("aud"),
                claims.get("client_id"),
            )
        else:
            LOGGER.error("auth.reject: %s", reason)
        return None, frozenset()

    sub = _subject_from(claims)
    if not sub:
        LOGGER.error("auth.reject: no_subject")
        return None, frozenset()

    groups = _groups_from(claims)

    if LOGGER.isEnabledFor(logging.INFO):
        LOGGER.info("auth.ok: sub=%s groups=%s", sub, sorted(groups))

    return str(sub), groups


def _is_wrestler(groups: FrozenSet[str]) -> bool:
    """Return True if the user belongs to the Wrestlers group."""
    return WRESTLERS in groups


def _is_promoter(groups: FrozenSet[str]) -> bool:
    """Return True if the user belongs to the Promoters group."""
    return PROMOTERS in groups


def require_scopes(event: Dict[str, Any], required: Iterable[str]) -> bool:
    """Return True if all required scopes are present in the JWT authorizer context."""
    jwt_ctx = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}) or {}
    scopes_val = jwt_ctx.get("scopes") or jwt_ctx.get("scope") or ""
    present = set(str(scopes_val).split()) if scopes_val else set()
    return set(required).issubset(present)


def in_any_group(groups: FrozenSet[str], allowed: Iterable[str]) -> bool:
    """Return True if the user is in any of the allowed groups."""
    allowed_lc = {str(x).strip().lower() for x in allowed}
    return any(g in allowed_lc for g in groups)
