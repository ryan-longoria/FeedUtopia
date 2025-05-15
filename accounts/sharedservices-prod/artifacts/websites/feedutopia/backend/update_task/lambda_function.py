import os
import json
import boto3

dynamodb = boto3.resource("dynamodb")
table    = dynamodb.Table(os.environ["TABLE_NAME"])

def respond(code, body=""):
    headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*"
    }
    return {
      "statusCode": code,
      "headers": headers,
      "body": json.dumps(body) if body else ""
    }

def lambda_handler(event, context):
    tid = event.get("pathParameters", {}).get("taskId")
    if not tid:
        return respond(400, {"error": "Missing path parameter 'taskId'"})

    try:
        body = json.loads(event.get("body") or "{}")
        done = bool(body.get("done", False))
    except json.JSONDecodeError:
        return respond(400, {"error": "Invalid JSON"})

    try:
        table.update_item(
            Key={"taskId": tid},
            UpdateExpression="SET #d = :v",
            ExpressionAttributeNames={"#d": "done"},
            ExpressionAttributeValues={":v": done}
        )
        return respond(204)
    except Exception as e:
        return respond(500, {"error": str(e)})