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

resource "aws_cloudwatch_log_group" "vpc_flow_logs" {
  name              = "/aws/vpc/flow_logs/${aws_vpc.main.id}"
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
# Lambda Duration Alarms
#############################

resource "aws_cloudwatch_metric_alarm" "fetch_data_duration_high" {
  alarm_name          = "${var.project_name}-fetch_data-duration-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Average"
  threshold           = 4000
  alarm_description   = "Alert if fetch_data function average duration exceeds 4s in a 5-minute window."
  dimensions = {
    FunctionName = aws_lambda_function.fetch_data.function_name
  }
  alarm_actions = [aws_sns_topic.monitoring_topic.arn]
}

resource "aws_cloudwatch_metric_alarm" "check_duplicate_duration_high" {
  alarm_name          = "${var.project_name}-check_duplicate-duration-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Average"
  threshold           = 3000
  alarm_description   = "Alert if check_duplicate function average duration exceeds 3s in a 5-minute window."
  dimensions = {
    FunctionName = aws_lambda_function.check_duplicate.function_name
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
  threshold           = 2000
  alarm_description   = "Alert if notify_post function average duration exceeds 2s in a 5-minute window."
  dimensions = {
    FunctionName = aws_lambda_function.notify_post.function_name
  }
  alarm_actions = [aws_sns_topic.monitoring_topic.arn]
}

#############################
# Lambda Memory Alarms
#############################

resource "aws_cloudwatch_metric_alarm" "fetch_data_memory_high" {
  alarm_name          = "${var.project_name}-fetch_data-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "max_memory_used"
  namespace           = "LambdaInsights"
  period              = 300
  statistic           = "Average"
  threshold           = 900
  alarm_description   = "Alert if fetch_data memory usage exceeds 900 MB in a 5-minute window."
  dimensions = {
    FunctionName = aws_lambda_function.fetch_data.function_name
  }
  alarm_actions = [aws_sns_topic.monitoring_topic.arn]
}

resource "aws_cloudwatch_metric_alarm" "check_duplicate_memory_high" {
  alarm_name          = "${var.project_name}-check_duplicate-memory-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "max_memory_used"
  namespace           = "LambdaInsights"
  period              = 300
  statistic           = "Average"
  threshold           = 500
  alarm_description   = "Alert if check_duplicate memory usage exceeds 500 MB in a 5-minute window."
  dimensions = {
    FunctionName = aws_lambda_function.check_duplicate.function_name
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
# Step Function Alarms
#############################

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

  alarm_actions = [aws_sns_topic.monitoring_topic.arn]
}

resource "aws_cloudwatch_metric_alarm" "automated_workflow_timeouts" {
  alarm_name          = "${var.project_name}-automated-workflow-timeouts"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ExecutionsTimedOut"
  namespace           = "AWS/States"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert if the automated Step Function times out within a 5-minute window."

  dimensions = {
    StateMachineArn = aws_sfn_state_machine.automated_workflow.arn
  }

  alarm_actions = [aws_sns_topic.monitoring_topic.arn]
}

resource "aws_cloudwatch_metric_alarm" "automated_workflow_aborts" {
  alarm_name          = "${var.project_name}-automated-workflow-aborts"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ExecutionsAborted"
  namespace           = "AWS/States"
  period              = 300
  statistic           = "Sum"
  threshold           = 1
  alarm_description   = "Alert if the automated Step Function is aborted within a 5-minute window."

  dimensions = {
    StateMachineArn = aws_sfn_state_machine.automated_workflow.arn
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

#############################
# VPC Flow Logs
#############################

resource "aws_cloudwatch_log_metric_filter" "vpc_flow_logs_rejected_filter" {
  name           = "VPCFlowLogsRejectedRequests"
  log_group_name = aws_cloudwatch_log_group.vpc_flow_logs.name
  pattern        = "[version, account_id, interface_id, srcaddr, dstaddr, srcport, dstport, protocol, packets, bytes, start, end, action=REJECT, log_status]"

  metric_transformation {
    name      = "NumRejectedRequests"
    namespace = "VPCFlowLogs"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "vpc_flow_logs_rejected_alarm" {
  alarm_name                = "vpc-flow-logs-rejected-traffic-alarm"
  comparison_operator       = "GreaterThanThreshold"
  evaluation_periods        = 1
  threshold                 = 100
  metric_name               = aws_cloudwatch_log_metric_filter.vpc_flow_logs_rejected_filter.metric_transformation[0].name
  namespace                 = aws_cloudwatch_log_metric_filter.vpc_flow_logs_rejected_filter.metric_transformation[0].namespace
  period                    = 300
  statistic                 = "Sum"
  alarm_description         = "Triggers if we see more than 100 REJECTed flow records in 5 minutes"
  alarm_actions             = [aws_sns_topic.monitoring_topic.arn]
  insufficient_data_actions = []
  ok_actions                = []
}
