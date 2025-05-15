import os
import json
import uuid
import boto3

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["TABLE_NAME"])

def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
        text = body.get("text", "").strip()
        if not text:
            return {
                "statusCode": 400,
                "headers": {"Content-Type": "application/json"},
                "body": json.dumps({"error": "Missing 'text' in body"})
            }
        task_id = str(uuid.uuid4())
        item = {
            "taskId": task_id,
            "text": text,
            "done": False
        }
        table.put_item(Item=item)
        return {
            "statusCode": 201,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps(item)
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"error": str(e)})
        }
