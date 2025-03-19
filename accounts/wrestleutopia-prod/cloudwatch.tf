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
  alarm_description   = "Alert if fetch_data function returns any errors in a 5-minute window."

  dimensions = {
    FunctionName = aws_lambda_function.fetch_data.function_name
  }

  alarm_actions = [
    aws_sns_topic.monitoring_topic.arn
  ]
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

  alarm_actions = [
    aws_sns_topic.monitoring_topic.arn
  ]
}

resource "aws_cloudwatch_metric_alarm" "process_content_errors" {
  alarm_name          = "${var.project_name}-process_content-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert if process_content function returns any errors in a 5-minute window."

  dimensions = {
    FunctionName = aws_lambda_function.process_content.function_name
  }

  alarm_actions = [
    aws_sns_topic.monitoring_topic.arn
  ]
}

resource "aws_cloudwatch_metric_alarm" "store_data_errors" {
  alarm_name          = "${var.project_name}-store_data-errors"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert if store_data function returns any errors in a 5-minute window."

  dimensions = {
    FunctionName = aws_lambda_function.store_data.function_name
  }

  alarm_actions = [
    aws_sns_topic.monitoring_topic.arn
  ]
}

resource "aws_cloudwatch_metric_alarm" "render_video_errors" {
  alarm_name          = "${var.project_name}-render_video-errors"
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

  alarm_actions = [
    aws_sns_topic.monitoring_topic.arn
  ]
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

  alarm_actions = [
    aws_sns_topic.monitoring_topic.arn
  ]
}

resource "aws_cloudwatch_metric_alarm" "automated_workflow_failures" {
  alarm_name          = "${var.project_name}-automated-workflow-failures"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ExecutionsFailed"
  namespace           = "AWS/States"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert if the automated Step Function fails within a 5-minute window."

  dimensions = {
    StateMachineArn = aws_sfn_state_machine.automated_workflow.arn
  }

  alarm_actions = [
    aws_sns_topic.monitoring_topic.arn
  ]
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

resource "aws_cloudwatch_log_group" "automated_step_function_log_group" {
  name              = "/aws/vendedlogs/states/automated_${var.project_name}_workflow"
  retention_in_days = 3
}

resource "aws_cloudwatch_log_group" "manual_step_function_log_group" {
  name              = "/aws/vendedlogs/states/manual_${var.project_name}_workflow"
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

resource "aws_cloudwatch_log_group" "process_content_log_group" {
  name              = "/aws/lambda/process_content"
  retention_in_days = 3
}

resource "aws_cloudwatch_log_group" "render_video_log_group" {
  name              = "/aws/lambda/render_video"
  retention_in_days = 3
}

resource "aws_cloudwatch_log_group" "store_data_log_group" {
  name              = "/aws/lambda/store_data"
  retention_in_days = 3
}

resource "aws_cloudwatch_log_group" "sns_to_teams_log_group" {
  name              = "/aws/lambda/sns_to_teams"
  retention_in_days = 3
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
  retention_in_days = 3
}

resource "aws_cloudwatch_metric_alarm" "fetch_data_invocations_anomaly" {
  alarm_name                = "${var.project_name}-fetch-data-invocations-anomaly"
  comparison_operator       = "GreaterThanUpperThreshold"
  evaluation_periods        = 2
  threshold_metric_id       = "e1"
  alarm_description         = "Alert if fetch_data invocations deviate from normal"
  alarm_actions             = [aws_sns_topic.monitoring_topic.arn]
  insufficient_data_actions = []
  ok_actions                = []

  metric_query {
    id          = "m1"
    label       = "FetchDataInvocationsWithAnomalyDetection"
    return_data = true
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

resource "aws_cloudwatch_metric_alarm" "check_duplicate_invocations_anomaly" {
  alarm_name                = "${var.project_name}-check-duplicate-invocations-anomaly"
  comparison_operator       = "GreaterThanUpperThreshold"
  evaluation_periods        = 2
  threshold_metric_id       = "e1"
  alarm_description         = "Alert if check_duplicate invocations deviate from normal"
  alarm_actions             = [aws_sns_topic.monitoring_topic.arn]
  insufficient_data_actions = []
  ok_actions                = []

  metric_query {
    id          = "m1"
    label       = "CheckDuplicateInvocationsWithAnomalyDetection"
    return_data = true
    metric {
      metric_name = "Invocations"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
      dimensions = {
        FunctionName = aws_lambda_function.check_duplicate.function_name
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

resource "aws_cloudwatch_metric_alarm" "process_content_invocations_anomaly" {
  alarm_name                = "${var.project_name}-process-content-invocations-anomaly"
  comparison_operator       = "GreaterThanUpperThreshold"
  evaluation_periods        = 2
  threshold_metric_id       = "e1"
  alarm_description         = "Alert if process_content invocations deviate from normal"
  alarm_actions             = [aws_sns_topic.monitoring_topic.arn]
  insufficient_data_actions = []
  ok_actions                = []

  metric_query {
    id          = "m1"
    label       = "ProcessContentInvocationsWithAnomalyDetection"
    return_data = true
    metric {
      metric_name = "Invocations"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
      dimensions = {
        FunctionName = aws_lambda_function.process_content.function_name
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

resource "aws_cloudwatch_metric_alarm" "store_data_invocations_anomaly" {
  alarm_name                = "${var.project_name}-store-data-invocations-anomaly"
  comparison_operator       = "GreaterThanUpperThreshold"
  evaluation_periods        = 2
  threshold_metric_id       = "e1"
  alarm_description         = "Alert if store_data invocations deviate from normal"
  alarm_actions             = [aws_sns_topic.monitoring_topic.arn]
  insufficient_data_actions = []
  ok_actions                = []

  metric_query {
    id          = "m1"
    label       = "StoreDataInvocationsWithAnomalyDetection"
    return_data = true
    metric {
      metric_name = "Invocations"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
      dimensions = {
        FunctionName = aws_lambda_function.store_data.function_name
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
