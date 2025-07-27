################################################################################
## Cloudwatch
################################################################################

#############################
# Log Groups
#############################

resource "aws_cloudwatch_log_group" "apigw_access_logs" {
  name              = "/aws/apigateway/${aws_api_gateway_rest_api.api.name}/access-logs"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "instagram_api_logs" {
  name              = "/aws/http-api/${aws_apigatewayv2_api.instagram_api.id}"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "vpc_flow_logs" {
  name              = "/aws/vpc/flow_logs/${aws_vpc.API_vpc.id}"
  retention_in_days = 3
}

resource "aws_cloudwatch_metric_alarm" "manual_workflow_failures" {
  alarm_name          = "${var.project_name}-manual-workflow-failures"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ExecutionsFailed"
  namespace           = "AWS/States"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert if the manual Step Function fails within a 5-minute window."

  dimensions = {
    StateMachineArn = aws_sfn_state_machine.manual_workflow.arn
  }

  alarm_actions = [
    aws_sns_topic.monitoring_topic.arn
  ]
}

resource "aws_cloudwatch_log_group" "manual_step_function_log_group" {
  name              = "/aws/vendedlogs/states/manual_workfloww"
  retention_in_days = 3
}

resource "aws_cloudwatch_log_group" "render_video" {
  name              = "/ecs/render_video"
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

resource "aws_cloudwatch_log_group" "delete_logo_log_group" {
  name              = "/aws/lambda/delete_logo"
  retention_in_days = 3
}

resource "aws_cloudwatch_log_group" "create_feed_post_log_group" {
  name              = "/aws/lambda/create_feed_post"
  retention_in_days = 3
}

resource "aws_cloudwatch_log_group" "generate_upload_url_log_group" {
  name              = "/aws/lambda/generate_upload_url"
  retention_in_days = 3
}

resource "aws_cloudwatch_log_group" "kb_list_log_group" {
  name              = "/aws/lambda/kb_list"
  retention_in_days = 3
}

resource "aws_cloudwatch_log_group" "kb_presign_log_group" {
  name              = "/aws/lambda/kb_presign"
  retention_in_days = 3
}

resource "aws_cloudwatch_log_group" "waf_logs" {
  name              = "aws-waf-logs-apigw"
  retention_in_days = 14
}

resource "aws_cloudwatch_log_group" "weekly_recap_log_group" {
  name              = "/aws/stepfunctions/weekly_recap"
  retention_in_days = 3
}

resource "aws_cloudwatch_log_group" "weekly_recap" {
  name              = "/ecs/weekly_recap"
  retention_in_days = 3
}

resource "aws_iam_role_policy_attachment" "ecs_exec_cloudwatch" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess"
}

resource "aws_cloudwatch_log_group" "render_carousel_logs" {
  name              = "/ecs/render_carousel"
  retention_in_days = 14
}

#############################
# Lambda Error Alarms
#############################

resource "aws_cloudwatch_metric_alarm" "start_sfn_errors" {
  alarm_name          = "${var.project_name}-start-sfn-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert if start_sfn function returns any errors in a 5-minute window."

  dimensions = {
    FunctionName = aws_lambda_function.start_sfn.function_name
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
# API Gateway Alarms
#############################

resource "aws_cloudwatch_metric_alarm" "apigw_5xx_errors" {
  alarm_name          = "api-gateway-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 10
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 60
  statistic           = "Sum"
  alarm_description   = "Alert if 5xx errors exceed 10 in 1 minute"

  dimensions = {
    ApiName = aws_api_gateway_rest_api.api.name
    Stage   = aws_api_gateway_stage.api_stage.stage_name
  }

  alarm_actions = [
    aws_sns_topic.monitoring_topic.arn
  ]
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
