################################################################################
## Cloudwatch
################################################################################

resource "aws_cloudwatch_event_rule" "workflow_schedule" {
  name                = "${var.project_name}_workflow_schedule"
  schedule_expression = var.schedule_expression
}

resource "aws_cloudwatch_event_target" "state_machine_target" {
  rule      = aws_cloudwatch_event_rule.workflow_schedule.name
  target_id = "${var.project_name}_StepFunctionStateMachine"
  arn       = aws_sfn_state_machine.automated_workflow.arn
  role_arn  = aws_iam_role.eventbridge_role.arn
}

resource "aws_cloudwatch_metric_alarm" "fetch_data_errors" {
  alarm_name          = "${var.project_name}-fetch-data-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert if fetch_data Lambda function returns any errors in a 5-minute window."

  dimensions = {
    FunctionName = aws_lambda_function.fetch_data.function_name
  }

  alarm_actions = [
    aws_sns_topic.monitoring_topic.arn
  ]
}

resource "aws_cloudwatch_metric_alarm" "step_functions_failures" {
  alarm_name          = "${var.project_name}-stepfunctions-failures"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ExecutionsFailed"
  namespace           = "AWS/States"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert if any Step Function executions fail within a 5-minute window."

  dimensions = {
    StateMachineArn = aws_sfn_state_machine.automated_workflow.arn
  }

  alarm_actions = [
    aws_sns_topic.monitoring_topic.arn
  ]
}

resource "aws_cloudwatch_metric_alarm" "dlq_alarm" {
  alarm_name          = "${var.project_name}-dlq-alarm"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Average"
  threshold           = 0

  alarm_description   = "Triggers if there are any messages in the DLQ."

  dimensions = {
    QueueName = aws_sqs_queue.lambda_dlq.name
  }

  alarm_actions = [
    aws_sns_topic.monitoring_topic.arn
  ]
}

resource "aws_cloudwatch_log_group" "vpc_flow_logs" {
  name              = "/aws/vpc/flow_logs/${aws_vpc.main.id}"
  retention_in_days = 7
}

resource "aws_cloudwatch_metric_alarm" "nat_gateway_bytes_out_alarm" {
  alarm_name          = "nat-gateway-high-bytes-out"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "BytesOutToDestination"
  namespace           = "AWS/NATGateway"
  period              = 300
  statistic           = "Sum"
  threshold           = 50000000
  alarm_description   = "Triggers if NAT Gateway sends more than 50 MB out in 5 minutes"

  dimensions = {
    NatGatewayId = aws_nat_gateway.nat.id
  }

  alarm_actions = [
    aws_sns_topic.monitoring_topic.arn
  ]
}