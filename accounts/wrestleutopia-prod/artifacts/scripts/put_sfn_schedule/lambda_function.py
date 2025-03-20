import json
import os
import boto3

def lambda_handler(event, context):
    """
    This function calls SSM's StartAutomationExecution to run the
    AttachSFNResourcePolicy document with any needed parameters.
    """

    ssm = boto3.client("ssm")

    document_name = os.environ.get("SSM_DOCUMENT_NAME", "AttachSFNResourcePolicy")
    automation_role = os.environ.get("AUTOMATION_ROLE", "arn:aws:iam::111111111111:role/SSMAutomationRole")
    resource_arn   = os.environ.get("RESOURCE_ARN",  "arn:aws:states:us-east-2:111111111111:stateMachine:my-stepfunction")
    policy_b64     = os.environ.get("POLICY_B64",    "BASE64ENCODED_POLICY_JSON")

    response = ssm.start_automation_execution(
        DocumentName=document_name,
        Parameters={
            "ResourceArn":         [resource_arn],
            "PolicyB64":           [policy_b64],
            "AutomationAssumeRole":[automation_role]
        }
    )

    return {
        "statusCode": 200,
        "automationExecutionId": response["AutomationExecutionId"]
    }
