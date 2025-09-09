################################################################################
## Cloudwatch
################################################################################

resource "aws_cloudwatch_event_rule" "cognito_cleanup_rule" {
  name                = "${var.project_name}-cognito-cleanup-hourly"
  schedule_expression = "rate(1 hour)"
}

resource "aws_cloudwatch_event_target" "cognito_cleanup_target" {
  rule      = aws_cloudwatch_event_rule.cognito_cleanup_rule.name
  target_id = "lambda"
  arn       = aws_lambda_function.cognito_cleanup.arn
}
