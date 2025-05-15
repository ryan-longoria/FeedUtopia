import os, json, boto3
from boto3.dynamodb.conditions import Attr

table = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])

def lambda_handler(event, _):
    tid = event["pathParameters"]["taskId"]
    body = json.loads(event.get("body") or "{}")
    done = bool(body.get("done"))

    table.update_item(
        Key={"taskId": tid},
        UpdateExpression="SET #d = :v",
        ExpressionAttributeNames={"#d": "done"},
        ExpressionAttributeValues={":v": done}
    )

    return {
        "statusCode": 204,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        },
        "body": ""
    }
