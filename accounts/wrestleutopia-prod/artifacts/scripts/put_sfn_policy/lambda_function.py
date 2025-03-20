import boto3
import json

def lambda_handler(event, context):
    sfn_client = boto3.client("stepfunctions")

    resource_arn = event["ResourceArn"]
    policy = event["PolicyJson"]

    resp = sfn_client.put_resource_policy(
        resourceArn=resource_arn,
        policy=policy
    )

    return {
        "statusCode": 200,
        "body": resp
    }