import json
import logging
import os
import re
import unicodedata
from datetime import datetime, timezone
from typing import Dict, List, Pattern

ALLOWED_ROLES = {
    r.strip().casefold()
    for r in os.getenv("ALLOWED_ROLES", "wrestler,promoter").split(",")
}
MIN_AGE_YEARS = int(os.getenv("MIN_AGE_YEARS", "13"))
ENVIRONMENT = os.getenv("ENVIRONMENT", "dev").lower()
LOG_LEVEL = os.getenv(
    "LOG_LEVEL", "DEBUG" if ENVIRONMENT != "prod" else "ERROR"
).upper()

logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO))
LOGGER = logging.getLogger("pre_signup")

DOB_RE: Pattern[str] = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SAFE_TEXT_RE: Pattern[str] = re.compile(r"^[\w .,'-]{1,80}$", re.UNICODE)


def jlog(level: int, msg: str, **fields) -> None:
    """Emit a structured JSON log line without PII."""
    payload = {"msg": msg, "service": "pre-signup", "env": ENVIRONMENT, **fields}
    LOGGER.log(level, json.dumps(payload, separators=(",", ":"), ensure_ascii=False))


def norm(value: str) -> str:
    """Normalize and trim user-supplied text for consistent validation."""
    return unicodedata.normalize("NFKC", (value or "").strip())


def bad_public(message: str) -> None:
    """Raise a user-facing exception with a generic, non-PII message."""
    raise Exception(message)


def validate_dob(dob: str, missing_labels: List[str]) -> None:
    """Validate YYYY-MM-DD format and enforce a minimum age requirement."""
    date_str = norm(dob)
    if not DOB_RE.match(date_str):
        missing_labels.append("DOB format YYYY-MM-DD")
        return

    try:
        dob_dt = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        missing_labels.append("DOB format YYYY-MM-DD")
        return

    today = datetime.now(timezone.utc).date()
    age = (
        today.year
        - dob_dt.year
        - ((today.month, today.day) < (dob_dt.month, dob_dt.day))
    )
    if age < MIN_AGE_YEARS:
        missing_labels.append(f"Minimum age {MIN_AGE_YEARS}")


def validate_field(
    value: str,
    label: str,
    missing_labels: List[str],
    pattern: Pattern[str] = SAFE_TEXT_RE,
    max_len: int = 80,
) -> None:
    """Validate presence, length, and character set for a text field."""
    val = norm(value)
    if not val:
        missing_labels.append(label)
        return
    if len(val) > max_len or not pattern.match(val):
        missing_labels.append(f"{label} (invalid characters/length)")


def resolve_role(attrs: Dict[str, str]) -> str:
    """Resolve and allow-list the user role from custom attributes."""
    role = norm(attrs.get("custom:role", ""))
    return role.casefold() if role.casefold() in ALLOWED_ROLES else ""


def lambda_handler(event: Dict, _ctx) -> Dict:
    """Validate required attributes by role for Cognito pre-signup."""
    meta = {
        "triggerSource": event.get("triggerSource"),
        "userPoolId": event.get("userPoolId"),
        "callerContextClientId": (event.get("callerContext") or {}).get("clientId"),
    }

    req = event.get("request", {}) or {}
    attrs: Dict[str, str] = req.get("userAttributes") or {}

    jlog(logging.DEBUG, "event.received", **meta)
    jlog(logging.DEBUG, "attr.keys", attrKeys=sorted(attrs.keys()), **meta)

    role = resolve_role(attrs)
    jlog(logging.DEBUG, "role.resolved", role=role or "INVALID", **meta)

    if not role:
        jlog(logging.WARNING, "role.invalid", **meta)
        bad_public("Unknown role; select Wrestler or Promoter.")

    missing: List[str] = []

    if role == "wrestler":
        req_map = {
            "given_name": "First name",
            "family_name": "Last name",
            "custom:stageName": "Stage name",
            "custom:dob": "DOB (YYYY-MM-DD)",
            "custom:city": "City",
            "custom:region": "State/Region",
            "custom:country": "Country",
        }
        for key, label in req_map.items():
            if key == "custom:dob":
                validate_dob(attrs.get(key, ""), missing)
            else:
                validate_field(attrs.get(key, ""), label, missing)

        jlog(logging.DEBUG, "validation.wrestler", failedLabels=list(missing), **meta)

    elif role == "promoter":
        req_map = {
            "custom:orgName": "Promotion/Org name",
            "custom:city": "City",
            "custom:region": "State/Region",
            "custom:country": "Country",
        }
        for key, label in req_map.items():
            validate_field(attrs.get(key, ""), label, missing, max_len=80)

        jlog(logging.DEBUG, "validation.promoter", failedLabels=list(missing), **meta)

    if missing:
        level = logging.ERROR if ENVIRONMENT == "prod" else logging.INFO
        jlog(level, "validation.failed", role=role, failedLabels=list(missing), **meta)
        bad_public("Missing or invalid required fields: " + ", ".join(missing))

    jlog(logging.INFO, "validation.passed", role=role, **meta)
    return event
