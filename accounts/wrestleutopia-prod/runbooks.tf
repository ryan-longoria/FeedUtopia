################################################################################
## Systems Manager (SSM) Automation Runbooks
################################################################################

resource "aws_ssm_document" "attach_sfn_policy" {
  name            = "AttachSFNResourcePolicy"
  document_type   = "Automation"
  document_format = "JSON"
  depends_on      = [aws_iam_role.ssm_automation_role]

  content = <<-DOC
    {
    "schemaVersion": "0.3",
    "description": "Attach a Step Functions resource-based policy if missing",
    "assumeRole": "{{AutomationAssumeRole}}",
    "parameters": {
        "ResourceArn": {
        "type": "String",
        "description": "The ARN of the Step Functions state machine or resource."
        },
        "PolicyJson": {
        "type": "String",
        "description": "The JSON representing the resource policy."
        },
        "AutomationAssumeRole": {
        "type": "String",
        "description": "(Recommended) The IAM role the runbook will assume. If omitted, the runbook will use the credentials of the user or service calling the runbook."
        }
    },
    "mainSteps": [
        {
        "action": "aws:executeAwsApi",
        "name": "AttachPolicy",
        "inputs": {
            "RoleArn": "{{ AutomationAssumeRole }}",
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
  name                = aws_ssm_document.attach_sfn_policy.name
  schedule_expression = "rate(12 hours)"
  association_name    = "AttachPolicyAutomation"

  parameters = {
    ResourceArn          = aws_sfn_state_machine.manual_workflow.arn
    PolicyJson           = data.aws_iam_policy_document.cross_account_sfn_resource_policy.json
    AutomationAssumeRole = aws_iam_role.ssm_automation_role.arn
  }
}