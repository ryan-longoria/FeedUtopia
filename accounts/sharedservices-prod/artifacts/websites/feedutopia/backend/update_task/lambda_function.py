import os, json, boto3

def respond(code, body=""):
    return {
      "statusCode": code,
      "headers": {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      "body": json.dumps(body) if body else ""
    }

def lambda_handler(event, context):
    table_name = os.environ.get("TABLE_NAME")
    if not table_name:
        return respond(500, {"error": "TABLE_NAME not set"})
    table = boto3.resource("dynamodb").Table(table_name)

    tid = (event.get("pathParameters") or {}).get("taskId")
    if not tid:
        return respond(400, {"error": "Missing 'taskId'"})

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
