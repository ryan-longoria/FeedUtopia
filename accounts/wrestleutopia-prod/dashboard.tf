################################################################################
## Cloudwatch Dashboards
################################################################################

#############################
# Lambda Dashboard
#############################

resource "aws_cloudwatch_dashboard" "lambdas_dashboard" {
  dashboard_name = "LambdaDashboard"
  dashboard_body = jsonencode({
    widgets = [
      {
        "type" : "metric",
        "x" : 0,
        "y" : 0,
        "width" : 12,
        "height" : 6,
        "properties" : {
          "title" : "Lambda Errors",
          "region" : var.aws_region,
          "metrics" : [
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.fetch_data.function_name],
            [".", "Errors", "FunctionName", aws_lambda_function.check_duplicate.function_name],
            [".", "Errors", "FunctionName", aws_lambda_function.notify_post.function_name],
            [".", "Errors", "FunctionName", aws_lambda_function.sns_to_teams.function_name]
          ],
          "period" : 300,
          "stat" : "Sum"
        }
      },

      {
        "type" : "metric",
        "x" : 12,
        "y" : 0,
        "width" : 12,
        "height" : 6,
        "properties" : {
          "title" : "Lambda Throttles",
          "region" : var.aws_region,
          "metrics" : [
            ["AWS/Lambda", "Throttles", "FunctionName", aws_lambda_function.fetch_data.function_name],
            [".", "Throttles", "FunctionName", aws_lambda_function.check_duplicate.function_name],
            [".", "Throttles", "FunctionName", aws_lambda_function.notify_post.function_name],
            [".", "Throttles", "FunctionName", aws_lambda_function.sns_to_teams.function_name]
          ],
          "period" : 300,
          "stat" : "Sum"
        }
      },

      {
        "type" : "metric",
        "x" : 0,
        "y" : 6,
        "width" : 12,
        "height" : 6,
        "properties" : {
          "title" : "Lambda Duration (Average)",
          "region" : var.aws_region,
          "metrics" : [
            ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.fetch_data.function_name, { "stat" : "Average" }],
            [".", "Duration", "FunctionName", aws_lambda_function.check_duplicate.function_name, { "stat" : "Average" }],
            [".", "Duration", "FunctionName", aws_lambda_function.notify_post.function_name, { "stat" : "Average" }],
            [".", "Duration", "FunctionName", aws_lambda_function.sns_to_teams.function_name, { "stat" : "Average" }]
          ],
          "period" : 300
        }
      },

      {
        "type" : "alarm",
        "x" : 12,
        "y" : 6,
        "width" : 12,
        "height" : 6,
        "properties" : {
          "title" : "Lambda Alarms",
          "alarms" : [
            aws_cloudwatch_metric_alarm.fetch_data_errors.arn,
            aws_cloudwatch_metric_alarm.check_duplicate_errors.arn,
            aws_cloudwatch_metric_alarm.notify_post_errors.arn,
          ]
        }
      }
    ]
  })
}

#############################
# Step Function Dashboard
#############################

resource "aws_cloudwatch_dashboard" "step_functions_dashboard" {
  dashboard_name = "StepFunctionsDashboard"
  dashboard_body = jsonencode({
    widgets = [
      {
        "type" : "metric",
        "x" : 0,
        "y" : 0,
        "width" : 12,
        "height" : 6,
        "properties" : {
          "title" : "Step Function Executions",
          "region" : var.aws_region,
          "metrics" : [
            ["AWS/States", "ExecutionsStarted", "StateMachineArn", aws_sfn_state_machine.automated_workflow.arn],
            [".", "ExecutionsSucceeded", ".", "."],
            [".", "ExecutionsFailed", ".", "."],
            [".", "ExecutionsTimedOut", ".", "."],
            [".", "ExecutionsAborted", ".", "."]
          ],
          "period" : 300,
          "stat" : "Sum"
        }
      },

      {
        "type" : "alarm",
        "x" : 12,
        "y" : 0,
        "width" : 12,
        "height" : 6,
        "properties" : {
          "title" : "Step Function Alarms",
          "alarms" : [
            aws_cloudwatch_metric_alarm.automated_workflow_failures.arn,
            aws_cloudwatch_metric_alarm.automated_workflow_timeouts.arn,
            aws_cloudwatch_metric_alarm.automated_workflow_aborts.arn
          ]
        }
      }
    ]
  })
}

