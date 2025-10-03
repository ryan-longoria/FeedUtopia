import re
import json as _jsonmod

def _claims(event):
    jwt = (event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}) or {})
    raw = jwt.get("claims") or {}
    claims = {str(k).lower(): v for k, v in raw.items()}

    sub = claims.get("sub") or claims.get("username")
    groups = set()

    cg = claims.get("cognito:groups")
    if isinstance(cg, list):
        groups |= {str(x) for x in cg}
    elif isinstance(cg, str):
        s = cg.strip()
        parsed = None
        if s.startswith("["):
            try:
                parsed = _jsonmod.loads(s)
            except Exception:
                parsed = None
        if isinstance(parsed, list):
            groups |= {str(x) for x in parsed}
        else:
            for part in re.split(r"[,\s]+", s):
                if part:
                    groups.add(part)

    scope_str = claims.get("scope") or ""
    scopes = set(scope_str.split()) if scope_str else set()
    # (kept for parity; currently no inferred group addition)

    role = (claims.get("custom:role") or "").strip().lower()
    if role.startswith("wrestler"):
        groups.add("Wrestlers")
    elif role.startswith("promoter"):
        groups.add("Promoters")

    return sub, groups

def _is_wrestler(groups: set[str]) -> bool:
    return any((g or "").strip().lower() == "wrestlers" for g in groups)

def _is_promoter(groups: set[str]) -> bool:
    return any((g or "").strip().lower() == "promoters" for g in groups)
