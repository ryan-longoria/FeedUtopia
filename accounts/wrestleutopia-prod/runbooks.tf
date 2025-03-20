################################################################################
## Systems Manager (SSM) Automation Runbooks
################################################################################

resource "aws_ssm_document" "attach_sfn_policy" {
  name            = "AttachSFNResourcePolicy"
  document_type   = "Automation"
  document_format = "JSON"

  content = <<-DOC
{
  "schemaVersion": "0.3",
  "description": "Attach Step Functions resource-based policy if missing",
  "parameters": {
    "ResourceArn": {
      "type": "String"
    },
    "PolicyJson": {
      "type": "String"
    },
    "AutomationAssumeRole": {
      "type": "String"
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
  name         = aws_ssm_document.attach_sfn_policy.name
  schedule_expression = "rate(12 hours)"
  association_name   = "AttachPolicyAutomation"
  
  automation_target_parameter_name = "ResourceArn"

  parameters = {
    "ResourceArn"          = aws_sfn_state_machine.manual_workflow.arn
    "PolicyJson"           = data.aws_iam_policy_document.cross_account_sfn_resource_policy.json
    "AutomationAssumeRole" = aws_iam_role.ssm_automation_role.arn
  }
}