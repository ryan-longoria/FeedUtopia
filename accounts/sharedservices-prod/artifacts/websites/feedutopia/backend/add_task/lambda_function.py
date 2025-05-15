import os
import json
import uuid
import boto3

dynamodb = boto3.resource("dynamodb")
table    = dynamodb.Table(os.environ["TABLE_NAME"])

def respond(code, body=None):
    return {
        "statusCode": code,
        "headers": {
            "Content-Type":                "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        "body": json.dumps(body) if body is not None else ""
    }

def lambda_handler(event, context):
    try:
        data       = json.loads(event.get("body") or "{}")
        text       = data.get("text", "").strip()
        assignedTo = data.get("assignedTo", "").strip()

        if not text:
            return respond(400, {"error": "Missing 'text'"})

        task_id = str(uuid.uuid4())
        item = {
            "taskId":     task_id,
            "text":       text,
            "done":       False,
            "assignedTo": assignedTo
        }

        table.put_item(Item=item)
        return respond(201, item)

    except Exception as e:
        return respond(500, {"error": str(e)})
