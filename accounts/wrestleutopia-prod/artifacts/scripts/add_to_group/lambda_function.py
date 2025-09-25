import os
import re
import json
import logging
import datetime
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ------------------------------
# Config / clients
# ------------------------------
cognito = boto3.client("cognito-idp")
AWS_REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-2"

# Optional (recommended) env vars for initial profile writes
TABLE_WRESTLERS = os.environ.get("TABLE_WRESTLERS")
TABLE_PROMOTERS = os.environ.get("TABLE_PROMOTERS")

_ddb = None
def ddb():
    global _ddb
    if _ddb is None:
        _ddb = boto3.resource("dynamodb", region_name=AWS_REGION)
    return _ddb

DOB_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

def now_iso():
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"

def _str(x):
    return (x or "").strip()

def _safe_int(x):
    try:
        return int(x)
    except Exception:
        return None

def _write_wrestler_profile(sub: str, attrs: dict):
    """
    Create or upsert the minimal Wrestler profile row so it's present
    immediately after email confirmation. Uses UpdateItem with if_not_exists
    to keep createdAt stable across re-runs.
    """
    if not TABLE_WRESTLERS:
        logger.info("TABLE_WRESTLERS not set; skipping wrestler profile bootstrap.")
        return

    t = ddb().Table(TABLE_WRESTLERS)

    first = _str(attrs.get("given_name"))
    last  = _str(attrs.get("family_name"))
    stage = _str(attrs.get("custom:stageName"))
    dob   = _str(attrs.get("custom:dob"))
    city  = _str(attrs.get("custom:city"))
    region= _str(attrs.get("custom:region"))
    country=_str(attrs.get("custom:country"))

    # Just a light format check; Pre-Sign-Up validator should have enforced already
    if dob and not DOB_RE.match(dob):
        logger.warning("DOB did not match YYYY-MM-DD; writing as-is: %s", dob)

    ts = now_iso()
    # Minimal canonical fields you already use in your API
    expr = (
        "SET #role = if_not_exists(#role, :role), "
        "#createdAt = if_not_exists(#createdAt, :ts), "
        "#updatedAt = :ts, "
        "#firstName = :first, "
        "#lastName  = :last, "
        "#stageName = :stage, "
        "#dob = :dob, "
        "#city = :city, "
        "#region = :region, "
        "#country = :country, "
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
        ":dob": dob,
        ":city": city,
        ":region": region,
        ":country": country,
        ":name": f"{first} {last}".strip(),
        ":emptyList": [],
    }

    try:
        t.update_item(
            Key={"userId": sub},
            UpdateExpression=expr,
            ExpressionAttributeNames={**names},
            ExpressionAttributeValues={**vals},
        )
        logger.info("Bootstrapped Wrestler profile for %s", sub)
    except ClientError as e:
        logger.exception("Wrestler profile bootstrap failed: %s", e)


def _write_promoter_profile(sub: str, attrs: dict):
    """
    Create or upsert the minimal Promoter profile row immediately after confirmation.
    """
    if not TABLE_PROMOTERS:
        logger.info("TABLE_PROMOTERS not set; skipping promoter profile bootstrap.")
        return

    t = ddb().Table(TABLE_PROMOTERS)

    orgName = _str(attrs.get("custom:orgName"))
    address = _str(attrs.get("custom:address"))

    # Optional city/region/country if you collect them later
    city    = _str(attrs.get("custom:city"))
    region  = _str(attrs.get("custom:region"))
    country = _str(attrs.get("custom:country"))

    ts = now_iso()
    expr = (
        "SET #role = if_not_exists(#role, :role), "
        "#createdAt = if_not_exists(#createdAt, :ts), "
        "#updatedAt = :ts, "
        "#orgName = :org, "
        "#address = :addr, "
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
        ":org": orgName,
        ":addr": address,
        ":city": city or None,
        ":region": region or None,
        ":country": country or None,
        ":emptyList": [],
        ":emptyMap": {},
    }

    try:
        t.update_item(
            Key={"userId": sub},
            UpdateExpression=expr,
            ExpressionAttributeNames={**names},
            ExpressionAttributeValues={**vals},
        )
        logger.info("Bootstrapped Promoter profile for %s", sub)
    except ClientError as e:
        logger.exception("Promoter profile bootstrap failed: %s", e)


def lambda_handler(event, context):
    """
    Cognito Post Confirmation trigger.
    - Adds user to a group based on custom:role
    - Bootstraps a minimal DynamoDB profile row for that role
    """
    logger.info("Trigger: %s", event.get("triggerSource"))
    logger.debug("Event: %s", json.dumps(event)[:2000])

    # Only run on normal email confirm
    if event.get("triggerSource") != "PostConfirmation_ConfirmSignUp":
        return event

    attrs = (event.get("request") or {}).get("userAttributes") or {}
    role_raw = _str(attrs.get("custom:role")).lower()

    user_pool_id = event.get("userPoolId")
    username     = event.get("userName")  # Cognito username (usually sub unless alias)
    sub          = _str(attrs.get("sub"))  # the user's sub, stable UUID

    # 1) Add to the appropriate group
    promoter_group = os.environ.get("PROMOTER_NAME") or "Promoters"
    default_group  = os.environ.get("DEFAULT_GROUP")  or "Wrestlers"

    group_name = promoter_group if role_raw in {"promoter", "promoters"} else default_group

    if not (user_pool_id and username and group_name):
        logger.warning(
            "Missing required fields for group add: user_pool_id=%s username=%s group_name=%s",
            user_pool_id, username, group_name
        )
    else:
        try:
            cognito.admin_add_user_to_group(
                UserPoolId=user_pool_id,
                Username=username,
                GroupName=group_name,
            )
            logger.info("Added %s to group: %s", username, group_name)
        except ClientError as e:
            # Don't fail the trigger on group add errors
            logger.exception("admin_add_user_to_group failed: %s", e)

    # 2) Bootstrap a minimal profile row (best-effort; do not block confirmation)
    try:
        if not sub:
            logger.warning("No sub in attributes; skipping profile bootstrap.")
        elif role_raw.startswith("promo"):
            _write_promoter_profile(sub, attrs)
        elif role_raw.startswith("wrestl") or group_name == default_group:
            _write_wrestler_profile(sub, attrs)
        else:
            logger.info("Unknown role '%s'; skipping profile bootstrap.", role_raw)
    except Exception as e:
        logger.exception("Profile bootstrap unexpected failure: %s", e)

    return event
