import os
import json
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def get_env_vars():
    """
    Retrieves and validates the required environment variables.
    Returns a dict containing these variables.
    Raises:
        ValueError: if any required environment variable is missing.
    """
    required_vars = ["TARGET_BUCKET", "CROSSACCOUNT_READ_ROLE_NAME", "ACCOUNT_MAP"]
    missing_vars = [var for var in required_vars if var not in os.environ]
    if missing_vars:
        raise ValueError(f"Missing environment variables: {missing_vars}")

    return {
        "target_bucket": os.environ["TARGET_BUCKET"],
        "role_name": os.environ["CROSSACCOUNT_READ_ROLE_NAME"],
        "account_map_json": os.environ["ACCOUNT_MAP"],
    }


def assume_role(sts_client, account_id, role_name):
    """
    Assumes an IAM role in the specified account and returns temporary credentials.
    
    Parameters:
    -----------
    sts_client : boto3.client
        Boto3 STS client.
    account_id : str
        The account ID to assume the role in.
    role_name : str
        The name of the IAM role to assume.
    
    Returns:
    --------
    dict
        Temporary credentials for the assumed role (includes AccessKeyId, SecretAccessKey, SessionToken).
    
    Raises:
    -------
    Exception
        If STS role assumption fails.
    """
    role_arn = f"arn:aws:iam::{account_id}:role/{role_name}"
    logger.info("Attempting to assume role: %s", role_arn)
    assumed = sts_client.assume_role(
        RoleArn=role_arn,
        RoleSessionName="GetLogoSession"
    )
    return assumed["Credentials"]


def download_logo(s3_client, bucket_name, key, download_path):
    """
    Downloads the specified object from S3.
    
    Parameters:
    -----------
    s3_client : boto3.client
        Boto3 S3 client.
    bucket_name : str
        Name of the S3 bucket containing the logo.
    key : str
        The key (file path) of the logo object in the bucket.
    download_path : str
        The local file path where the file should be downloaded.
    
    Raises:
    -------
    Exception
        If downloading the file fails.
    """
    logger.info("Downloading '%s' from bucket '%s' to '%s'", key, bucket_name, download_path)
    s3_client.download_file(bucket_name, key, download_path)


def upload_logo(s3_client, local_path, bucket_name, key):
    """
    Uploads the specified object to S3.
    
    Parameters:
    -----------
    s3_client : boto3.client
        Boto3 S3 client.
    local_path : str
        The local file path to upload.
    bucket_name : str
        The destination S3 bucket name.
    key : str
        The key (file path) under which to store the uploaded file in the bucket.
    
    Raises:
    -------
    Exception
        If uploading the file fails.
    """
    logger.info("Uploading '%s' to s3://%s/%s", local_path, bucket_name, key)
    s3_client.upload_file(local_path, bucket_name, key)


def lambda_handler(event, context):
    """
    AWS Lambda handler that copies a logo file from an S3 bucket in a target
    AWS account to a specified shared S3 bucket.
    
    Parameters
    ----------
    event : dict
        The event dictionary that triggers the function. Must contain an
        'accountName' key to identify the target account.
    context : LambdaContext
        The Lambda context object.
    
    Returns
    -------
    dict
        Dictionary containing the status of the operation, the target AWS
        account ID, the shared bucket name, and the key under which the
        logo is uploaded.
    
    Raises
    ------
    ValueError
        If 'accountName' is missing from the event or not found in
        the ACCOUNT_MAP.
    Exception
        If STS role assumption, S3 download, or upload fails.
    """
    sts_client = boto3.client("sts")
    s3_shared = boto3.client("s3")

    env_vars = get_env_vars()
    target_bucket = env_vars["target_bucket"]
    role_name = env_vars["role_name"]
    account_map = json.loads(env_vars["account_map_json"])

    logger.info("Event received: %s", json.dumps(event))

    account_name = event.get("accountName", "")
    if not account_name:
        msg = "No 'accountName' found in event input."
        logger.error(msg)
        raise ValueError(msg)

    if account_name not in account_map:
        msg = f"Unknown accountName '{account_name}' - not in ACCOUNT_MAP."
        logger.error(msg)
        raise ValueError(msg)

    target_account_id = account_map[account_name]
    logger.info("Selected account %s for project '%s'", target_account_id, account_name)

    try:
        creds = assume_role(sts_client, target_account_id, role_name)
    except Exception as e:
        logger.error("Failed to assume role in account '%s': %s", target_account_id, e)
        raise

    s3_account = boto3.client(
        "s3",
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds["SessionToken"]
    )

    remote_bucket_name = f"prod-{account_name}-artifacts-bucket"
    remote_logo_key = "logo.png"
    local_logo_path = "/tmp/Logo.png"

    try:
        download_logo(s3_account, remote_bucket_name, remote_logo_key, local_logo_path)
    except Exception as e:
        logger.error("Failed to download logo.png from %s: %s", remote_bucket_name, e)
        raise

    shared_logo_key = "artifacts/Logo.png"
    try:
        upload_logo(s3_shared, local_logo_path, target_bucket, shared_logo_key)
    except Exception as e:
        logger.error("Failed to upload Logo.png to shared bucket: %s", e)
        raise

    return {
        "status": "logo_copied",
        "targetAccountId": target_account_id,
        "sharedBucket": target_bucket,
        "logoKey": shared_logo_key
    }
