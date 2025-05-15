import os
import json
import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TABLE_NAME"])

def lambda_handler(event, context):
    task_id = None
    if event.get("pathParameters"):
        task_id = event["pathParameters"].get("taskId")
    if not task_id:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": "Missing path parameter 'taskId'"})
        }

    try:
        table.delete_item(Key={"taskId": task_id})
        return {
            "statusCode": 204,
            "headers": {"Content-Type": "application/json"},
            "body": ""
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)})
        }
