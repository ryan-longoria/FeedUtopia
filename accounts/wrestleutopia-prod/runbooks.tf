################################################################################
## Systems Manager (SSM) Automation Runbooks
################################################################################

resource "aws_ssm_document" "attach_sfn_policy" {
  name            = "AttachSFNResourcePolicy"                 # Must be unique
  document_type   = "Automation"
  document_format = "JSON"

  content = <<-DOC
  {
    "schemaVersion": "0.3",
    "description": "Attach Step Functions resource-based policy if missing",
    "parameters": {
      "ResourceArn": {
        "type": "String",
        "description": "ARN of the Step Functions state machine"
      },
      "PolicyJson": {
        "type": "String",
        "description": "The resource-based policy JSON to attach"
      }
    },
    "mainSteps": [
      {
        "action": "aws:executeAwsApi",
        "name": "AttachPolicy",
        "inputs": {
          "Service": "StepFunctions",
          "Api": "PutResourcePolicy",
          "ResourceArn": "{{ ResourceArn }}",
          "Policy": "{{ PolicyJson }}"
        }
      }
    ]
  }
  DOC
}

resource "aws_ssm_association" "attach_policy_scheduled" {
  name = aws_ssm_document.attach_sfn_policy.name

  schedule_expression = "rate(12 hours)"

  parameters = {
    "ResourceArn" = aws_sfn_state_machine.manual_workflow.arn
    "PolicyJson"  = data.aws_iam_policy_document.cross_account_sfn_resource_policy.json
  }
}

resource "aws_ssm_association" "attach_policy_scheduled" {
  name                = aws_ssm_document.attach_sfn_policy.name
  schedule_expression = "rate(12 hours)"

  parameters = {
    "ResourceArn" = aws_sfn_state_machine.manual_workflow.arn
    "PolicyJson"  = data.aws_iam_policy_document.cross_account_sfn_resource_policy.json
  }
}