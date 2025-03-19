################################################################################
## Cloudwatch
################################################################################

resource "aws_cloudwatch_log_group" "vpc_flow_logs" {
  name              = "/aws/vpc/flow_logs/${aws_vpc.API_vpc.id}"
  retention_in_days = 3
}

resource "aws_cloudwatch_event_rule" "crossaccount_schedule" {
  name                = "crossaccount-invoker-schedule"
  schedule_expression = "rate(1 hour)" 
}

resource "aws_cloudwatch_event_target" "crossaccount_target" {
  rule      = aws_cloudwatch_event_rule.crossaccount_schedule.name
  arn       = aws_lambda_function.crossaccounts_invoker.arn
  target_id = "crossaccount-invoker-target"
}

resource "aws_lambda_permission" "allow_eventbridge_trigger" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.crossaccounts_invoker.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.crossaccount_schedule.arn
}
