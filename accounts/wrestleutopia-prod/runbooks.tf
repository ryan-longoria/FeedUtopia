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
    "assumeRole": "{{ AutomationAssumeRole }}",
    "parameters": {
      "ResourceArn":      { "type": "String" },
      "PolicyB64":        { "type": "String" },
      "AutomationAssumeRole": { "type": "String" }
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
