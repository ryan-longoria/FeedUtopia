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

resource "aws_cloudwatch_log_group" "render_video_log_group" {
  name              = "/aws/lambda/render_video"
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

resource "aws_cloudwatch_log_group" "waf_logs" {
  name              = "aws-waf-logs-apigw"
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

resource "aws_cloudwatch_metric_alarm" "render_video_errors" {
  alarm_name          = "${var.project_name}-render-video-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert if render_video function returns any errors in a 5-minute window."

  dimensions = {
    FunctionName = aws_lambda_function.render_video.function_name
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
# Lambda Duration Alarms
#############################

resource "aws_cloudwatch_metric_alarm" "start_sfn_duration_high" {
  alarm_name          = "${var.project_name}-start-sfn-duration-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Average"
  threshold           = 4000
  alarm_description   = "Alert if start_sfn function average duration exceeds 4s in a 5-minute window."
  dimensions = {
    FunctionName = aws_lambda_function.start_sfn.function_name
  }
  alarm_actions = [aws_sns_topic.monitoring_topic.arn]
}

resource "aws_cloudwatch_metric_alarm" "render_video_duration_high" {
  alarm_name          = "${var.project_name}-render-video-duration-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Average"
  threshold           = 60000
  alarm_description   = "Alert if render_video function average duration exceeds 1m in a 5-minute window."
  dimensions = {
    FunctionName = aws_lambda_function.render_video.function_name
  }
  alarm_actions = [aws_sns_topic.monitoring_topic.arn]
}

resource "aws_cloudwatch_metric_alarm" "notify_post_duration_high" {
  alarm_name          = "${var.project_name}-notify_post-duration-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Average"
  threshold           = 60000
  alarm_description   = "Alert if notify_post function average duration exceeds 1m in a 5-minute window."
  dimensions = {
    FunctionName = aws_lambda_function.notify_post.function_name
  }
  alarm_actions = [aws_sns_topic.monitoring_topic.arn]
}

#############################
# Lambda Memory Alarms
#############################

resource "aws_cloudwatch_metric_alarm" "render_video_memory_high" {
  alarm_name          = "${var.project_name}-render-video-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "max_memory_used"
  namespace           = "LambdaInsights"
  period              = 300
  statistic           = "Average"
  threshold           = 900
  alarm_description   = "Alert if render_video memory usage exceeds 900 MB in a 5-minute window."
  dimensions = {
    FunctionName = aws_lambda_function.render_video.function_name
  }
  alarm_actions = [aws_sns_topic.monitoring_topic.arn]
}

resource "aws_cloudwatch_metric_alarm" "start_sfn_memory_high" {
  alarm_name          = "${var.project_name}-start-sfn-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "max_memory_used"
  namespace           = "LambdaInsights"
  period              = 300
  statistic           = "Average"
  threshold           = 500
  alarm_description   = "Alert if start_sfn memory usage exceeds 500 MB in a 5-minute window."
  dimensions = {
    FunctionName = aws_lambda_function.start_sfn.function_name
  }
  alarm_actions = [aws_sns_topic.monitoring_topic.arn]
}

resource "aws_cloudwatch_metric_alarm" "notify_post_memory_high" {
  alarm_name          = "${var.project_name}-notify_post-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "max_memory_used"
  namespace           = "LambdaInsights"
  period              = 300
  statistic           = "Average"
  threshold           = 300
  alarm_description   = "Alert if notify_post memory usage exceeds 300 MB in a 5-minute window."
  dimensions = {
    FunctionName = aws_lambda_function.notify_post.function_name
  }
  alarm_actions = [aws_sns_topic.monitoring_topic.arn]
}

#############################
# Lambda Anomaly Detection Alarms
#############################

resource "aws_cloudwatch_metric_alarm" "start_sfn_invocations_anomaly" {
  alarm_name                = "${var.project_name}-start-sfn-invocations-anomaly"
  comparison_operator       = "GreaterThanUpperThreshold"
  evaluation_periods        = 2
  threshold_metric_id       = "e1"
  alarm_description         = "Alert if start_sfn invocations deviate from normal"
  alarm_actions             = [aws_sns_topic.monitoring_topic.arn]
  insufficient_data_actions = []
  ok_actions                = []

  metric_query {
    id          = "m1"
    label       = "StartSFNInvocationsWithAnomalyDetection"
    return_data = true
    metric {
      metric_name = "Invocations"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
      dimensions = {
        FunctionName = aws_lambda_function.start_sfn.function_name
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

resource "aws_cloudwatch_metric_alarm" "render_video_invocations_anomaly" {
  alarm_name                = "${var.project_name}-render-video-invocations-anomaly"
  comparison_operator       = "GreaterThanUpperThreshold"
  evaluation_periods        = 2
  threshold_metric_id       = "e1"
  alarm_description         = "Alert if render_video invocations deviate from normal"
  alarm_actions             = [aws_sns_topic.monitoring_topic.arn]
  insufficient_data_actions = []
  ok_actions                = []

  metric_query {
    id          = "m1"
    label       = "RenderVideoInvocationsWithAnomalyDetection"
    return_data = true
    metric {
      metric_name = "Invocations"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
      dimensions = {
        FunctionName = aws_lambda_function.render_video.function_name
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

resource "aws_cloudwatch_metric_alarm" "notify_post_invocations_anomaly" {
  alarm_name                = "${var.project_name}-notify-post-invocations-anomaly"
  comparison_operator       = "GreaterThanUpperThreshold"
  evaluation_periods        = 2
  threshold_metric_id       = "e1"
  alarm_description         = "Alert if notify_post invocations deviate from normal"
  alarm_actions             = [aws_sns_topic.monitoring_topic.arn]
  insufficient_data_actions = []
  ok_actions                = []

  metric_query {
    id          = "m1"
    label       = "NotifyPostInvocationsWithAnomalyDetection"
    return_data = true
    metric {
      metric_name = "Invocations"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
      dimensions = {
        FunctionName = aws_lambda_function.notify_post.function_name
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

resource "aws_cloudwatch_metric_alarm" "sns_to_teams_invocations_anomaly" {
  alarm_name                = "${var.project_name}-sns-to-teams-invocations-anomaly"
  comparison_operator       = "GreaterThanUpperThreshold"
  evaluation_periods        = 2
  threshold_metric_id       = "e1"
  alarm_description         = "Alert if sns_to_teams invocations deviate from normal"
  alarm_actions             = [aws_sns_topic.monitoring_topic.arn]
  insufficient_data_actions = []
  ok_actions                = []

  metric_query {
    id          = "m1"
    label       = "SnsToTeamsInvocationsWithAnomalyDetection"
    return_data = true
    metric {
      metric_name = "Invocations"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
      dimensions = {
        FunctionName = aws_lambda_function.sns_to_teams.function_name
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
# Step Function Alarms
#############################

resource "aws_cloudwatch_metric_alarm" "manual_workflow_timeouts" {
  alarm_name          = "${var.project_name}-manual-workflow-timeouts"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ExecutionsTimedOut"
  namespace           = "AWS/States"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert if the manual Step Function times out within a 5-minute window."

  dimensions = {
    StateMachineArn = aws_sfn_state_machine.manual_workflow.arn
  }

  alarm_actions = [aws_sns_topic.monitoring_topic.arn]
}

resource "aws_cloudwatch_metric_alarm" "manual_workflow_aborts" {
  alarm_name          = "${var.project_name}-manual-workflow-aborts"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ExecutionsAborted"
  namespace           = "AWS/States"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert if the manual Step Function is aborted within a 5-minute window."

  dimensions = {
    StateMachineArn = aws_sfn_state_machine.manual_workflow.arn
  }

  alarm_actions = [aws_sns_topic.monitoring_topic.arn]
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
