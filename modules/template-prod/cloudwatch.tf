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

resource "aws_cloudwatch_log_group" "fetch_data_log_group" {
  name              = "/aws/lambda/fetch_data"
  retention_in_days = 2
}

resource "aws_cloudwatch_log_group" "notify_post_log_group" {
  name              = "/aws/lambda/notify_post"
  retention_in_days = 2
}

resource "aws_cloudwatch_log_group" "process_content_log_group" {
  name              = "/aws/lambda/process_content"
  retention_in_days = 2
}

resource "aws_cloudwatch_log_group" "render_video_log_group" {
  name              = "/aws/lambda/render_video"
  retention_in_days = 2
}

resource "aws_cloudwatch_log_group" "store_data_log_group" {
  name              = "/aws/lambda/fetch_data"
  retention_in_days = 2
}

resource "aws_cloudwatch_log_group" "sns_to_teams_log_group" {
  name              = "/aws/lambda/sns_to_teams"
  retention_in_days = 2
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

  alarm_description = "Triggers if there are any messages in the DLQ."

  dimensions = {
    QueueName = aws_sqs_queue.lambda_dlq.name
  }

  alarm_actions = [
    aws_sns_topic.monitoring_topic.arn
  ]
}

resource "aws_cloudwatch_log_group" "vpc_flow_logs" {
  name              = "/aws/vpc/flow_logs/${aws_vpc.main.id}"
  retention_in_days = 2
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

resource "aws_cloudwatch_metric_alarm" "lambda_invocations_anomaly" {
  alarm_name                = "LambdaInvocationsAnomaly"
  comparison_operator       = "GreaterThanUpperThreshold"
  evaluation_periods        = 2
  metric_name               = "Invocations"
  namespace                 = "AWS/Lambda"
  statistic                 = "Sum"
  period                    = 300
  threshold_metric_id       = "e1"
  alarm_description         = "Alert if Lambda invocations deviates from normal"
  alarm_actions             = [aws_sns_topic.monitoring_topic.arn]
  insufficient_data_actions = []
  ok_actions                = []

  dimensions = {
    FunctionName = aws_lambda_function.fetch_data.function_name
  }

  metric_query {
    id          = "m1"
    label       = "InvocationsWithAnomalyDetection"
    return_data = false
    metric {
      metric_name = "Invocations"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
      dimensions = {
        FunctionName = aws_lambda_function.fetch_data.function_name
      }
    }
  }

  metric_query {
    id          = "e1"
    expression  = "ANOMALY_DETECTION_BAND(m1, 2)"
    label       = "AnomalyDetectionBand"
    return_data = true
  }
}
