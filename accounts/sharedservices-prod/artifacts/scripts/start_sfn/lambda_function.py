import os
import json
import base64
import uuid
import boto3

sfn_client = boto3.client("stepfunctions")
s3_client = boto3.client("s3")

def extract_value(field):
    if isinstance(field, dict) and "value" in field:
        return field["value"]
    return field

def lambda_handler(event, context):
    body = json.loads(event.get("body", "{}"))

    raw_account_name = body.get("accountName")
    raw_title = body.get("title")
    raw_description = body.get("description")
    
    account_name = extract_value(raw_account_name) or ""
    title = extract_value(raw_title) or ""
    description = extract_value(raw_description) or ""
    
    image_path = ""
    file_info = body.get("file")
    if file_info and isinstance(file_info, dict):
        file_name = file_info.get("name", "upload.jpg")
        content_bytes = file_info.get("contentBytes")
        if content_bytes:
            try:
                file_data = base64.b64decode(content_bytes)
                unique_id = uuid.uuid4().hex
                upload_key = f"uploads/{unique_id}_{file_name}"
                target_bucket = os.environ["TARGET_BUCKET"]
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
            except Exception as e:
                print(f"Error processing file upload: {e}")
                image_path = ""
    
    response = sfn_client.start_execution(
        stateMachineArn=os.environ["STATE_MACHINE_ARN"],
        input=json.dumps({
            "accountName": account_name,
            "title": title,
            "description": description,
            "image_path": image_path
        })
    )

    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Step Function started",
            "executionArn": response["executionArn"]
        })
    }
