import os
import json
import boto3

sfn_client = boto3.client("stepfunctions")

def extract_value(field):
    if isinstance(field, dict) and "value" in field:
        return field["value"]
    return field

def lambda_handler(event, context):
    body = json.loads(event.get('body', '{}'))

    raw_account_name = body.get('accountName')
    raw_title        = body.get('title')
    raw_description  = body.get('description')
    raw_image_path   = body.get('image_path')

    account_name = extract_value(raw_account_name) or ""
    title        = extract_value(raw_title) or ""
    description  = extract_value(raw_description) or ""
    image_path   = extract_value(raw_image_path) or ""

    response = sfn_client.start_execution(
        stateMachineArn=os.environ['STATE_MACHINE_ARN'],
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
         "executionArn": response['executionArn']
      })
    }
