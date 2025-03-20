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
  "description": "Attach a resource-based policy to a Step Functions state machine (via Lambda)",
  "assumeRole": "{{AutomationAssumeRole}}",
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
      "action": "aws:invokeLambdaFunction",
      "name": "put_sfn_policy",
      "inputs": {
        "FunctionName": "put_sfn_policy",
        "Payload": "{\"ResourceArn\": \"{{ ResourceArn }}\", \"PolicyB64\": \"{{ PolicyB64 }}\"}"
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
    AutomationAssumeRole = aws_iam_role.ssm_automation_role.arn

    PolicyB64 = base64encode(data.aws_iam_policy_document.cross_account_sfn_resource_policy.json)
  }
}