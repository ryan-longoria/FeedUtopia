import os
import logging
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

cognito = boto3.client("cognito-idp")


def lambda_handler(event, context):
    """
    Cognito Post Confirmation trigger.
    - Reads custom:role from user attributes
    - Adds the confirmed user to either the Promoters or Wrestlers group

    Env vars:
      DEFAULT_GROUP = fallback group name (e.g., "Wrestlers")
      PROMOTER_NAME = group name for promoters (e.g., "Promoters")
    """
    logger.info("Trigger: %s", event.get("triggerSource"))

    if event.get("triggerSource") != "PostConfirmation_ConfirmSignUp":
        return event

    attrs = (event.get("request") or {}).get("userAttributes") or {}
    role = (attrs.get("custom:role") or "").strip().lower()

    group_name = (
        os.environ.get("PROMOTER_NAME")
        if role in {"promoter", "promoters"}
        else os.environ.get("DEFAULT_GROUP")
    )

    user_pool_id = event.get("userPoolId")
    username = event.get("userName")

    if not (user_pool_id and username and group_name):
        logger.warning(
            "Missing required fields: user_pool_id=%s username=%s group_name=%s",
            user_pool_id, username, group_name
        )
        return event

    try:
        cognito.admin_add_user_to_group(
            UserPoolId=user_pool_id,
            Username=username,
            GroupName=group_name,
        )
        logger.info("Added %s to group: %s", username, group_name)
    except Exception as e:
        logger.exception("admin_add_user_to_group failed: %s", e)

    return event
