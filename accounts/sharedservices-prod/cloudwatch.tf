################################################################################
## Cloudwatch
################################################################################

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