import boto3
import os

def lambda_handler(event, context):
    role_arn = os.environ["HOST_ACCOUNT_ROLE_ARN"]  

    state_machine_arn = os.environ["STATE_MACHINE_ARN"]

    step_input = event.get("input", "{}")

    sts_client = boto3.client("sts")
    assumed = sts_client.assume_role(
        RoleArn=role_arn,
        RoleSessionName="CrossAccountStartExec"
    )

    creds = assumed["Credentials"]

    sfn_client = boto3.client(
        "stepfunctions",
        aws_access_key_id=creds["AccessKeyId"],
        aws_secret_access_key=creds["SecretAccessKey"],
        aws_session_token=creds["SessionToken"],
        region_name="us-east-2"
    )

    response = sfn_client.start_execution(
        stateMachineArn=state_machine_arn,
        input=step_input
    )

    return {
        "statusCode": 200,
        "body": f"Started execution: {response['executionArn']}"
    }
