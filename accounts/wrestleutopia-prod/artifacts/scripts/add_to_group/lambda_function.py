import datetime
import json
import logging
import os
import re
from typing import Any, Dict, Optional

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError


LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=getattr(logging, LOG_LEVEL, logging.INFO))
logger = logging.getLogger(__name__)

AWS_REGION = (
    os.getenv("AWS_REGION")
    or os.getenv("AWS_DEFAULT_REGION")
    or "us-east-2"
)
BOTO_CFG = Config(
    region_name=AWS_REGION,
    retries={"max_attempts": 4, "mode": "standard"},
    read_timeout=5,
    connect_timeout=3,
)
cognito = boto3.client("cognito-idp", config=BOTO_CFG)

_ddb = None

TABLE_WRESTLERS = os.getenv("TABLE_WRESTLERS")
TABLE_PROMOTERS = os.getenv("TABLE_PROMOTERS")
GROUP_ALLOWLIST = {
    g.strip() for g in os.getenv("GROUP_ALLOWLIST", "Wrestlers,Promoters").split(",")
}
DEFAULT_GROUP = os.getenv("DEFAULT_GROUP", "Wrestlers").strip()
PROMOTER_NAME = os.getenv("PROMOTER_NAME", "Promoters").strip()

DOB_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def jlog(level: str, msg: str, **fields) -> None:
    """Emit a structured JSON log line."""
    rec = {"message": msg, "level": level, **fields}
    fn = (
        logger.error
        if level == "ERROR"
        else logger.warning
        if level == "WARN"
        else logger.info
        if level == "INFO"
        else logger.debug
    )
    fn(json.dumps(rec, separators=(",", ":")))


def ddb():
    """Return a cached DynamoDB resource."""
    global _ddb
    if _ddb is None:
        _ddb = boto3.resource("dynamodb", region_name=AWS_REGION)
    return _ddb


def now_iso() -> str:
    """Return current UTC time as RFC3339 string without microseconds."""
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"


def _str(x: Optional[str]) -> str:
    """Return a trimmed string with None coalesced to empty."""
    return (x or "").strip()


def _put_metric(namespace: str, name: str, value: float, **dims) -> None:
    """Emit a CloudWatch EMF metric via structured logging."""
    blob = {
        "_aws": {
            "Timestamp": int(datetime.datetime.utcnow().timestamp() * 1000),
            "CloudWatchMetrics": [
                {
                    "Namespace": namespace,
                    "Dimensions": [list(dims.keys())] if dims else [[]],
                    "Metrics": [{"Name": name, "Unit": "Count"}],
                }
            ],
        },
        name: value,
    }
    blob.update(dims)
    logger.info(json.dumps(blob, separators=(",", ":")))


def _safe_update(
    table_name: str,
    key: Dict[str, Any],
    expr: str,
    names: Dict[str, str],
    values: Dict[str, Any],
) -> None:
    """Execute a DynamoDB UpdateItem call and log failures."""
    try:
        ddb().Table(table_name).update_item(
            Key=key,
            UpdateExpression=expr,
            ExpressionAttributeNames=names,
            ExpressionAttributeValues=values,
        )
    except ClientError as e:
        jlog("ERROR", "dynamodb_update_failed", table=table_name, error=str(e))
        _put_metric("WU/PostConfirm", "DynamoUpdateError", 1)


def _write_wrestler_profile(sub: str, attrs: dict) -> None:
    """Create or upsert a minimal Wrestler profile row."""
    if not TABLE_WRESTLERS:
        jlog("INFO", "wrestler_bootstrap_skipped", reason="TABLE_WRESTLERS unset")
        return

    first = _str(attrs.get("given_name"))
    last = _str(attrs.get("family_name"))
    stage = _str(attrs.get("custom:stageName"))
    dob = _str(attrs.get("custom:dob"))
    city = _str(attrs.get("custom:city"))
    region = _str(attrs.get("custom:region"))
    country = _str(attrs.get("custom:country"))

    if dob and not DOB_RE.match(dob):
        jlog("WARN", "dob_format_unexpected", dob=dob)

    ts = now_iso()
    expr = (
        "SET #role = if_not_exists(#role, :role), "
        "#createdAt = if_not_exists(#createdAt, :ts), "
        "#updatedAt = :ts, "
        "#firstName = :first, #lastName = :last, #stageName = :stage, "
        "#dob = :dob, #city = :city, #region = :region, #country = :country, "
        "#name = :name, "
        "#mediaKeys = if_not_exists(#mediaKeys, :emptyList), "
        "#highlights = if_not_exists(#highlights, :emptyList)"
    )
    names = {
        "#role": "role",
        "#createdAt": "createdAt",
        "#updatedAt": "updatedAt",
        "#firstName": "firstName",
        "#lastName": "lastName",
        "#stageName": "stageName",
        "#dob": "dob",
        "#city": "city",
        "#region": "region",
        "#country": "country",
        "#name": "name",
        "#mediaKeys": "mediaKeys",
        "#highlights": "highlights",
    }
    vals = {
        ":role": "Wrestler",
        ":ts": ts,
        ":first": first,
        ":last": last,
        ":stage": stage,
        ":dob": dob or None,
        ":city": city or None,
        ":region": region or None,
        ":country": country or None,
        ":name": f"{first} {last}".strip(),
        ":emptyList": [],
    }
    _safe_update(TABLE_WRESTLERS, {"userId": sub}, expr, names, vals)
    _put_metric("WU/PostConfirm", "WrestlerBootstrap", 1)


def _write_promoter_profile(sub: str, attrs: dict) -> None:
    """Create or upsert a minimal Promoter profile row."""
    if not TABLE_PROMOTERS:
        jlog("INFO", "promoter_bootstrap_skipped", reason="TABLE_PROMOTERS unset")
        return

    org_name = _str(attrs.get("custom:orgName"))
    address = _str(attrs.get("custom:address"))
    city = _str(attrs.get("custom:city"))
    region = _str(attrs.get("custom:region"))
    country = _str(attrs.get("custom:country"))

    ts = now_iso()
    expr = (
        "SET #role = if_not_exists(#role, :role), "
        "#createdAt = if_not_exists(#createdAt, :ts), "
        "#updatedAt = :ts, "
        "#orgName = :org, #address = :addr, "
        "#city = if_not_exists(#city, :city), "
        "#region = if_not_exists(#region, :region), "
        "#country = if_not_exists(#country, :country), "
        "#mediaKeys = if_not_exists(#mediaKeys, :emptyList), "
        "#highlights = if_not_exists(#highlights, :emptyList), "
        "#socials = if_not_exists(#socials, :emptyMap)"
    )
    names = {
        "#role": "role",
        "#createdAt": "createdAt",
        "#updatedAt": "updatedAt",
        "#orgName": "orgName",
        "#address": "address",
        "#city": "city",
        "#region": "region",
        "#country": "country",
        "#mediaKeys": "mediaKeys",
        "#highlights": "highlights",
        "#socials": "socials",
    }
    vals = {
        ":role": "Promoter",
        ":ts": ts,
        ":org": org_name,
        ":addr": address,
        ":city": city or None,
        ":region": region or None,
        ":country": country or None,
        ":emptyList": [],
        ":emptyMap": {},
    }
    _safe_update(TABLE_PROMOTERS, {"userId": sub}, expr, names, vals)
    _put_metric("WU/PostConfirm", "PromoterBootstrap", 1)


def lambda_handler(event, context):
    """Handle Cognito PostConfirmation trigger, add group, and bootstrap profile."""
    trigger = (event or {}).get("triggerSource")
    if trigger != "PostConfirmation_ConfirmSignUp":
        return event

    attrs: dict = ((event.get("request") or {}).get("userAttributes")) or {}
    role_raw = _str(attrs.get("custom:role")).lower()
    user_pool_id = event.get("userPoolId")
    username = event.get("userName")
    sub = _str(attrs.get("sub"))
    aws_request_id = getattr(context, "aws_request_id", "")

    promoter_group = PROMOTER_NAME
    default_group = DEFAULT_GROUP
    group_name = promoter_group if role_raw.startswith("promo") else default_group
    if group_name not in GROUP_ALLOWLIST:
        jlog(
            "WARN",
            "group_not_in_allowlist",
            request_id=aws_request_id,
            group=group_name,
            allowlist=list(GROUP_ALLOWLIST),
        )
        group_name = default_group

    if user_pool_id and username and group_name:
        try:
            cognito.admin_add_user_to_group(
                UserPoolId=user_pool_id,
                Username=username,
                GroupName=group_name,
            )
            _put_metric("WU/PostConfirm", "GroupAddSuccess", 1, group=group_name)
        except ClientError as e:
            jlog(
                "ERROR",
                "group_add_failed",
                request_id=aws_request_id,
                group=group_name,
                error=str(e),
            )
            _put_metric("WU/PostConfirm", "GroupAddError", 1, group=group_name)

    try:
        if not sub:
            jlog("WARN", "missing_sub_skip_bootstrap", request_id=aws_request_id)
        elif role_raw.startswith("promo"):
            _write_promoter_profile(sub, attrs)
        else:
            _write_wrestler_profile(sub, attrs)
    except Exception as e:
        jlog(
            "ERROR",
            "profile_bootstrap_failed",
            request_id=aws_request_id,
            error=str(e),
        )
        _put_metric("WU/PostConfirm", "BootstrapError", 1)

    return event
