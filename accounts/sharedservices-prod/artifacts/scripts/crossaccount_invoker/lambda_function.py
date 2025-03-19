import boto3
import json
import os

def lambda_handler(event, context):
    roles_json = os.environ["CROSS_ACCT_ROLES"]
    role_arns  = json.loads(roles_json)

    step_machine_arn = event.get("state_machine_arn", "arn-of-some-default")
    input_data       = event.get("input", "{}")

    results = []

    for role_arn in role_arns:
        sts_client = boto3.client("sts")
        assumed = sts_client.assume_role(
            RoleArn=role_arn,
            RoleSessionName="CrossAccountStartExec",
            DurationSeconds=43200
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
            stateMachineArn=step_machine_arn,
            input=input_data
        )
        execution_arn = response["executionArn"]
        results.append(execution_arn)
        print(f"Started {execution_arn}")

    return {"started_executions": results}
