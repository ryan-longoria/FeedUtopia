################################################################################
## Cloudwatch Dashboards
################################################################################

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
            [".", "Errors", "FunctionName", aws_lambda_function.process_content.function_name],
            [".", "Errors", "FunctionName", aws_lambda_function.store_data.function_name],
            [".", "Errors", "FunctionName", aws_lambda_function.render_video.function_name],
            [".", "Errors", "FunctionName", aws_lambda_function.notify_post.function_name],
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
            [".", "Throttles", "FunctionName", aws_lambda_function.process_content.function_name],
            [".", "Throttles", "FunctionName", aws_lambda_function.store_data.function_name],
            [".", "Throttles", "FunctionName", aws_lambda_function.render_video.function_name],
            [".", "Throttles", "FunctionName", aws_lambda_function.notify_post.function_name],
          ],
          "period" : 300,
          "stat" : "Sum"
        }
      },

      {
        "type" : "alarm",
        "x" : 0,
        "y" : 6,
        "width" : 24,
        "height" : 6,
        "properties" : {
          "title" : "Lambda Alarms",
          "alarms" : [
            aws_cloudwatch_metric_alarm.fetch_data_errors.arn,
          ]
        }
      }
    ]
  })
}

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
            [".", "ExecutionsFailed", ".", "."]
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
            aws_cloudwatch_metric_alarm.step_functions_failures.arn
          ]
        }
      }
    ]
  })
}
