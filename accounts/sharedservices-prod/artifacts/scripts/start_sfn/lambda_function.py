import os
import json
import base64
import uuid
import logging
import boto3

# Create a logger
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

    image_path = ""
    file_info = body.get("file")
    logger.info("File info (if any): %s", json.dumps(file_info) if file_info else "No file info provided")

    if file_info and isinstance(file_info, dict):
        file_name = file_info.get("name", "upload.jpg")
        logger.info("Detected file name: '%s'", file_name)

        content_bytes = file_info.get("contentBytes")
        if content_bytes:
            logger.info("contentBytes length: %d", len(content_bytes))
            try:
                file_data = base64.b64decode(content_bytes)
                logger.info("Decoded file size in bytes: %d", len(file_data))

                unique_id = uuid.uuid4().hex
                upload_key = f"uploads/{unique_id}_{file_name}"
                logger.info("S3 upload key will be: '%s'", upload_key)

                s3_client.put_object(
                    Bucket=target_bucket,
                    Key=upload_key,
                    Body=file_data,
                    ContentType="image/jpeg"
                )
                logger.info("File uploaded to S3 bucket '%s' at key '%s'", target_bucket, upload_key)

                image_path = s3_client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": target_bucket, "Key": upload_key},
                    ExpiresIn=3600
                )
                logger.info("Generated presigned URL for the uploaded file: %s", image_path)

            except Exception as e:
                logger.error("Error processing file upload: %s", e)
                image_path = ""
        else:
            logger.warning("No 'contentBytes' found in 'file' object. Skipping file upload.")
    else:
        logger.info("No valid 'file' object found in request body. Skipping file handling.")

    sf_input = {
        "accountName": account_name,
        "title": title,
        "description": description,
        "image_path": image_path
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
