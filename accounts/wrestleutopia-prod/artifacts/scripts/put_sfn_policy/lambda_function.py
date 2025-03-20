import json, base64, boto3

def lambda_handler(event, context):
    sfn = boto3.client('stepfunctions')

    resource_arn = event["ResourceArn"]
    policy_b64 = event["PolicyB64"]
    policy_json = base64.b64decode(policy_b64).decode("utf-8")

    resp = sfn.put_resource_policy(
        resourceArn=resource_arn,
        policy=policy_json
    )
    return resp