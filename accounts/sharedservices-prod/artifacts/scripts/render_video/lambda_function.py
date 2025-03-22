import os
import json
import logging
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

sfn_client = boto3.client("stepfunctions")
s3_client = boto3.client("s3")

def extract_value(field):
    if isinstance(field, dict) and "value" in field:
        return field["value"]
    return field

def lambda_handler(event, context):

    logger.info("Received event: %s", json.dumps(event))

    target_bucket = os.environ.get("TARGET_BUCKET", "NOT_SET")
    state_machine_arn = os.environ.get("STATE_MACHINE_ARN", "NOT_SET")
    logger.info("TARGET_BUCKET: %s", target_bucket)
    logger.info("STATE_MACHINE_ARN: %s", state_machine_arn)

    body_str = event.get("body", "{}")
    logger.info("Raw body string: %s", body_str)
    try:
        body = json.loads(body_str)
        logger.info("Parsed body JSON: %s", json.dumps(body))
    except Exception as e:
        logger.error("Error parsing body as JSON: %s", e)
        body = {}

    raw_account_name = body.get("accountName")
    raw_title = body.get("title")
    raw_description = body.get("description")

    account_name = extract_value(raw_account_name) or ""
    title = extract_value(raw_title) or ""
    description = extract_value(raw_description) or ""

    logger.info("Extracted fields -> accountName: '%s', title: '%s', description: '%s'",
                account_name, title, description)

    image_info = body.get("image_path")
    logger.info("image_path info: %s", json.dumps(image_info) if image_info else "No image_path provided")

    presigned_url = ""
    if image_info and isinstance(image_info, dict):
        bucket = image_info.get("bucket")
        key = image_info.get("key")

        if bucket and key:
            logger.info("Bucket: '%s', Key: '%s'", bucket, key)
            try:
                presigned_url = s3_client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": bucket, "Key": key},
                    ExpiresIn=3600
                )
                logger.info("Generated presigned URL: %s", presigned_url)
            except Exception as e:
                logger.error("Error generating presigned URL: %s", e)
                presigned_url = ""
        else:
            logger.warning("Either 'bucket' or 'key' is missing in 'image_path'")
    else:
        logger.info("No valid 'image_path' object found. Skipping presigned URL generation.")

    sf_input = {
        "accountName": account_name,
        "title": title,
        "description": description,
        "s3_bucket": bucket if image_info else "",
        "s3_key": key if image_info else "",
        "image_path": presigned_url
    }
    logger.info("Final Step Functions input: %s", json.dumps(sf_input))

    try:
        response = sfn_client.start_execution(
            stateMachineArn=state_machine_arn,
            input=json.dumps(sf_input)
        )
        logger.info("Step Function started successfully: %s", response["executionArn"])
        execution_arn = response["executionArn"]
    except Exception as e:
        logger.error("Error starting Step Function execution: %s", e)
        raise

    result = {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Step Function started",
            "executionArn": execution_arn
        })
    }
    logger.info("Lambda returning: %s", json.dumps(result))
    return result
