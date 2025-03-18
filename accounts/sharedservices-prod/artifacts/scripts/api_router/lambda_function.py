import os
import json
import boto3

sf_client = boto3.client("stepfunctions")

def lambda_handler(event, context):
    body_str = event.get("body", "{}")
    try:
        body = json.loads(body_str)
    except:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Invalid JSON in body"})
        }

    account_name = body.get("account_name")
    if not account_name:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": "Missing 'account_name' in body"})
        }

    all_arns = json.loads(os.environ["STEPFUNCTIONS_ARNS_JSON"])
    sf_arn = all_arns.get(account_name)
    if not sf_arn:
        return {
            "statusCode": 400,
            "body": json.dumps({"error": f"Unrecognized account_name: {account_name}"})
        }

    try:
        sf_response = sf_client.start_execution(
            stateMachineArn=sf_arn,
            input=json.dumps(body)
        )
        return {
            "statusCode": 200,
            "body": json.dumps({
                "message": "Started execution",
                "executionArn": sf_response["executionArn"]
            })
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "body": json.dumps({"error": str(e)})
        }
