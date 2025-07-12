################################################################################
## Cloudwatch
################################################################################

#############################
# Log Groups
#############################

resource "aws_cloudwatch_log_group" "automated_step_function_log_group" {
  name              = "/aws/vendedlogs/states/automated_workfloww"
  retention_in_days = 3
}

resource "aws_cloudwatch_log_group" "fetch_data_log_group" {
  name              = "/aws/lambda/fetch_data"
  retention_in_days = 3
}

resource "aws_cloudwatch_log_group" "notify_post_log_group" {
  name              = "/aws/lambda/notify_post"
  retention_in_days = 3
}

resource "aws_cloudwatch_log_group" "sns_to_teams_log_group" {
  name              = "/aws/lambda/sns_to_teams"
  retention_in_days = 3
}

#############################
# Lambda Error Alarms
#############################

resource "aws_cloudwatch_metric_alarm" "fetch_data_errors" {
  alarm_name          = "${var.project_name}-fetch-data-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert if fetch_data function returns any errors in a 5-minute window."

  dimensions = {
    FunctionName = aws_lambda_function.fetch_data.function_name
  }

  alarm_actions = [aws_sns_topic.monitoring_topic.arn]
}

resource "aws_cloudwatch_metric_alarm" "check_duplicate_errors" {
  alarm_name          = "${var.project_name}-check_duplicate-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert if check_duplicate function returns any errors in a 5-minute window."

  dimensions = {
    FunctionName = aws_lambda_function.check_duplicate.function_name
  }

  alarm_actions = [aws_sns_topic.monitoring_topic.arn]
}

resource "aws_cloudwatch_metric_alarm" "notify_post_errors" {
  alarm_name          = "${var.project_name}-notify_post-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert if notify_post function returns any errors in a 5-minute window."

  dimensions = {
    FunctionName = aws_lambda_function.notify_post.function_name
  }

  alarm_actions = [aws_sns_topic.monitoring_topic.arn]
}

#############################
# Step Function Event Rule and Target
#############################

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

#############################
# SNS / DLQ Alarms
#############################

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

  alarm_actions = [aws_sns_topic.monitoring_topic.arn]
}
