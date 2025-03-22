import os
import json
import base64
import uuid
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

sfn_client = boto3.client("stepfunctions")
s3_client = boto3.client("s3")

def extract_value(field):
    if isinstance(field, dict) and "value" in field:
        return field["value"]
    return field

def fix_padding(b64_string):
    missing_padding = len(b64_string) % 4
    if missing_padding:
        logger.info("Base64 string missing padding, adding %d '=' characters", 4 - missing_padding)
        b64_string += '=' * (4 - missing_padding)
    return b64_string

def lambda_handler(event, context):
    logger.info("Start_sfn invoked. Full event: %s", json.dumps(event))
    
    body_str = event.get("body", "{}")
    try:
        body = json.loads(body_str)
    except Exception as e:
        logger.error("Error parsing body as JSON: %s", e)
        body = {}
    logger.info("Parsed body: %s", json.dumps(body))
    
    raw_account_name = body.get("accountName")
    raw_title = body.get("title")
    raw_description = body.get("description")
    
    account_name = extract_value(raw_account_name) or ""
    title = extract_value(raw_title) or ""
    description = extract_value(raw_description) or ""
    
    logger.info("Extracted accountName: '%s', title: '%s', description: '%s'", account_name, title, description)
    
    image_path = ""
    file_info = body.get("file")
    if file_info and isinstance(file_info, dict):
        file_name = file_info.get("name", "upload.jpg")
        content_bytes = file_info.get("contentBytes")
        logger.info("File info received - name: '%s'", file_name)
        if content_bytes:
            try:
                logger.info("Raw contentBytes length: %d", len(content_bytes))
                content_bytes = fix_padding(content_bytes)
                logger.info("ContentBytes after padding fix: %d characters", len(content_bytes))
                file_data = base64.b64decode(content_bytes)
                unique_id = uuid.uuid4().hex
                upload_key = f"uploads/{unique_id}_{file_name}"
                target_bucket = os.environ["TARGET_BUCKET"]
                logger.info("Uploading file to bucket: '%s' with key: '%s'", target_bucket, upload_key)
                s3_client.put_object(
                    Bucket=target_bucket,
                    Key=upload_key,
                    Body=file_data,
                    ContentType="image/jpeg"
                )
                image_path = s3_client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": target_bucket, "Key": upload_key},
                    ExpiresIn=3600
                )
                logger.info("Generated presigned URL for image: %s", image_path)
            except Exception as e:
                logger.error("Error processing file upload: %s", e)
                image_path = ""
        else:
            logger.warning("No contentBytes found in file info.")
    else:
        logger.info("No file info provided in the request.")
    
    sf_input = {
        "accountName": account_name,
        "title": title,
        "description": description,
        "image_path": image_path
    }
    logger.info("Passing to Step Functions: %s", json.dumps(sf_input))
    
    try:
        response = sfn_client.start_execution(
            stateMachineArn=os.environ["STATE_MACHINE_ARN"],
            input=json.dumps(sf_input)
        )
        logger.info("Step Function started successfully: %s", response["executionArn"])
    except Exception as e:
        logger.error("Error starting Step Functions execution: %s", e)
        raise

    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Step Function started",
            "executionArn": response["executionArn"]
        })
    }
