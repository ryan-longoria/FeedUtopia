import os
import json
import logging
from typing import Any, Dict
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

sfn_client = boto3.client("stepfunctions")
s3_client = boto3.client("s3")


def extract_value(field: Any) -> Any:
    """
    Extract the 'value' key from a dictionary if it exists,
    otherwise return the field itself.

    Args:
        field (Any): A field that may be a dict or any other type.

    Returns:
        Any: The 'value' if present in the dict, otherwise the original field.
    """
    if isinstance(field, dict) and "value" in field:
        return field["value"]
    return field


def generate_presigned_url(bucket: str, key: str) -> str:
    """
    Generate a presigned URL for a given S3 bucket and key.

    Args:
        bucket (str): The S3 bucket name.
        key (str): The S3 object key.

    Returns:
        str: A presigned URL for the object, or an empty string if there's an error.
    """
    if not bucket or not key:
        logger.warning("Bucket or key is missing; cannot generate presigned URL.")
        return ""
    try:
        return s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=3600
        )
    except Exception as e:
        logger.error("Error generating presigned URL: %s", e)
        return ""


def parse_event_body(event_body_str: str) -> Dict[str, Any]:
    """
    Parse the JSON string from the event body.

    Args:
        event_body_str (str): A JSON-encoded string from the event body.

    Returns:
        dict: The parsed JSON as a dictionary. Returns an empty dict if parsing fails.
    """
    try:
        parsed_body = json.loads(event_body_str)
        logger.debug("Parsed body JSON: %s", json.dumps(parsed_body))
        return parsed_body
    except json.JSONDecodeError as e:
        logger.error("Error parsing body as JSON: %s", e)
        return {}


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler function.

    Processes the input event, extracts relevant fields, optionally generates
    a presigned URL for an image, then starts the specified AWS Step Functions
    state machine.

    Args:
        event (dict): The event dict provided to the Lambda function.
        context (Any): The runtime information for the Lambda function.

    Returns:
        dict: A dictionary containing a statusCode and body with the Step
        Functions execution details or error messages.
    """
    logger.info("Received event: %s", json.dumps(event))

    target_bucket = os.environ.get("TARGET_BUCKET", "")
    state_machine_arn = os.environ.get("STATE_MACHINE_ARN", "")
    logger.debug("TARGET_BUCKET: %s", target_bucket)
    logger.debug("STATE_MACHINE_ARN: %s", state_machine_arn)

    body_str = event.get("body", "{}")
    logger.debug("Raw body string: %s", body_str)
    body = parse_event_body(body_str)

    raw_account_name = body.get("accountName")
    raw_title = body.get("title")
    raw_description = body.get("description")
    raw_highlight_words_title = body.get("highlightWordsTitle")
    raw_highlight_words_description = body.get("highlightWordsDescription")
    raw_spinningArtifact = body.get("spinningArtifact")
    raw_background_type = body.get("backgroundType", "image")
    background_type = extract_value(raw_background_type).lower() or "image"

    account_name = extract_value(raw_account_name) or ""
    title = extract_value(raw_title) or ""
    description = extract_value(raw_description) or ""
    highlight_words_title = extract_value(raw_highlight_words_title) or ""
    highlight_words_description = extract_value(raw_highlight_words_description) or ""
    spinningArtifact = extract_value(raw_spinningArtifact) or ""


    logger.info(
        "Extracted fields -> accountName: '%s', title: '%s', description: '%s', "
        "highlightWordsTitle: '%s', highlightWordsDescription: '%s', spinningArtifact: '%s', "
        "backgroundType: '%s'",
        account_name,
        title,
        description,
        highlight_words_title,
        highlight_words_description,
        spinningArtifact,
        background_type
    )

    image_info = body.get("image_path", {})
    presigned_url_image = ""
    if isinstance(image_info, dict):
        logger.debug("image_path info: %s", json.dumps(image_info))
        bucket = image_info.get("bucket", "")
        key = image_info.get("key", "")
        presigned_url_image = generate_presigned_url(bucket, key)
    else:
        logger.debug("No valid 'image_path' object found, skipping presigned URL.")

    video_info = body.get("video_path", {})
    presigned_url_video = ""
    if isinstance(video_info, dict):
        logger.debug("video_path info: %s", json.dumps(video_info))
        bucket = video_info.get("bucket", "")
        key = video_info.get("key", "")
        presigned_url_video = generate_presigned_url(bucket, key)
    else:
        logger.debug("No valid 'video_path' object found, skipping presigned URL for video.")

    sf_input = {
        "accountName": account_name,
        "title": title,
        "description": description,
        "highlightWordsTitle": highlight_words_title,
        "highlightWordsDescription": highlight_words_description,
        "spinningArtifact": spinningArtifact,
        "s3_bucket_image": image_info.get("bucket", ""),
        "s3_key_image": image_info.get("key", ""),
        "s3_bucket_video": video_info.get("bucket", ""),
        "s3_key_video": video_info.get("key", ""),
        "image_path": presigned_url_image,
        "video_path": presigned_url_video,
        "backgroundType": background_type,
    }

    logger.info("Final Step Functions input: %s", json.dumps(sf_input))

    if not state_machine_arn:
        error_message = "STATE_MACHINE_ARN is not set."
        logger.error(error_message)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": error_message}),
        }

    try:
        response = sfn_client.start_execution(
            stateMachineArn=state_machine_arn,
            input=json.dumps(sf_input),
        )
        logger.info(
            "Step Function started successfully: %s",
            response["executionArn"],
        )
        execution_arn = response["executionArn"]
    except Exception as e:
        logger.error("Error starting Step Function execution: %s", e)
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)}),
        }

    result = {
        "statusCode": 200,
        "body": json.dumps(
            {
                "message": "Step Function started",
                "executionArn": execution_arn,
            }
        ),
    }
    logger.info("Lambda returning: %s", json.dumps(result))
    return result
