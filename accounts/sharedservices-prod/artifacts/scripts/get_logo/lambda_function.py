import os
import json
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

sts_client = boto3.client("sts")
s3_shared  = boto3.client("s3")

def lambda_handler(event, context):
    target_bucket    = os.environ["TARGET_BUCKET"]
    role_name        = os.environ["CROSSACCOUNT_READ_ROLE_NAME"]
    account_map_json = os.environ["ACCOUNT_MAP"]
    account_map      = json.loads(account_map_json)

    account_name = event.get("accountName", "")
    if not account_name:
        msg = "No 'accountName' found in event input"
        logger.error(msg)
        raise ValueError(msg)

    if account_name not in account_map:
        msg = f"Unknown accountName '{account_name}' - not in ACCOUNT_MAP"
        logger.error(msg)
        raise ValueError(msg)

    target_account_id = account_map[account_name]
    logger.info(f"Selected account {target_account_id} for project '{account_name}'")

    role_arn = f"arn:aws:iam::{target_account_id}:role/{role_name}"

    try:
        assumed = sts_client.assume_role(
            RoleArn=role_arn,
            RoleSessionName="GetLogoSession"
        )
        creds = assumed["Credentials"]
    except Exception as e:
        logger.error(f"Failed to assume role {role_arn}: {e}")
        raise

    s3_account = boto3.client(
        "s3",
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds["SessionToken"]
    )

    remote_bucket_name = f"prod-{account_name}-artifacts-bucket"
    remote_logo_key    = "logo.png"
    local_logo_path    = "/tmp/Logo.png"

    try:
        s3_account.download_file(remote_bucket_name, remote_logo_key, local_logo_path)
        logger.info(f"Downloaded logo.png from {remote_bucket_name}")
    except Exception as e:
        logger.error(f"Failed to download logo.png from {remote_bucket_name}: {e}")
        raise

    shared_logo_key = "artifacts/Logo.png"

    try:
        s3_shared.upload_file(local_logo_path, target_bucket, shared_logo_key)
        logger.info(f"Re-uploaded Logo.png to s3://{target_bucket}/{shared_logo_key}")
    except Exception as e:
        logger.error(f"Failed to upload Logo.png to shared bucket: {e}")
        raise

    return {
        "status": "logo_copied",
        "targetAccountId": target_account_id,
        "sharedBucket": target_bucket,
        "logoKey": shared_logo_key
    }
