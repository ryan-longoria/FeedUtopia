import os
import json
import boto3

sfn_client = boto3.client('stepfunctions')
def lambda_handler(event, context):
    body = json.loads(event.get('body', '{}'))

    account_name = body.get('accountName')
    title = body.get('title')
    description = body.get('description')
    image_path = body.get('image_path')

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
