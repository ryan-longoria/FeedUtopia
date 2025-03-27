################################################################################
## Cloudwatch Dashboards
################################################################################

#####################################################################
# Lambda Dashboard
#####################################################################

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
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.render_video.function_name],
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
            ["AWS/Lambda", "Throttles", "FunctionName", aws_lambda_function.render_video.function_name],
            [".", "Throttles", "FunctionName", aws_lambda_function.notify_post.function_name],
          ],
          "period" : 300,
          "stat" : "Sum"
        }
      }
    ]
  })
}

#####################################################################
# SFN Dashboard
#####################################################################

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
            ["AWS/States", "ExecutionsStarted", "StateMachineArn", aws_sfn_state_machine.manual_workflow.arn],
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
            aws_cloudwatch_metric_alarm.manual_workflow_failures.arn
          ]
        }
      }
    ]
  })
}

#####################################################################
# API Dashboard
#####################################################################

resource "aws_cloudwatch_dashboard" "api_monitoring_dashboard" {
  dashboard_name = "CrossAccountStateMachineDashboard"

  dashboard_body = jsonencode({
    start = "-3H"

    widgets = [
      {
        "type" : "metric",
        "x" : 0,
        "y" : 0,
        "width" : 12,
        "height" : 6,
        "properties" : {
          "title" : "API Gateway 4XX/5XX Errors",
          "view" : "timeSeries",
          "region" : var.aws_region,
          "stacked" : false,
          "period" : 60,
          "metrics" : [
            [
              "AWS/ApiGateway",
              "4XXError",
              "ApiName",
              aws_api_gateway_rest_api.api.name,
              "Stage",
              aws_api_gateway_stage.api_stage.stage_name,
              { "stat" : "Sum", "period" : 60 }
            ],
            [
              "AWS/ApiGateway",
              "5XXError",
              "ApiName",
              aws_api_gateway_rest_api.api.name,
              "Stage",
              aws_api_gateway_stage.api_stage.stage_name,
              { "stat" : "Sum", "period" : 60 }
            ]
          ]
        }
      },

      {
        "type" : "metric",
        "x" : 12,
        "y" : 0,
        "width" : 12,
        "height" : 6,
        "properties" : {
          "title" : "API Gateway Latency",
          "view" : "timeSeries",
          "region" : var.aws_region,
          "period" : 60,
          "metrics" : [
            [
              "AWS/ApiGateway",
              "Latency",
              "ApiName",
              aws_api_gateway_rest_api.api.name,
              "Stage",
              aws_api_gateway_stage.api_stage.stage_name,
              { "stat" : "Average" }
            ],
            [
              "AWS/ApiGateway",
              "IntegrationLatency",
              "ApiName",
              aws_api_gateway_rest_api.api.name,
              "Stage",
              aws_api_gateway_stage.api_stage.stage_name,
              { "stat" : "Average" }
            ]
          ]
        }
      }
    ]
  })
}

#####################################################################
# EFS Dashboard
#####################################################################

resource "aws_cloudwatch_dashboard" "efs_dashboard" {
  dashboard_name = "efs-monitoring-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        "type"   = "metric"
        "x"      = 0
        "y"      = 0
        "width"  = 6
        "height" = 6
        "properties" = {
          "title"  = "BurstCreditBalance"
          "region" = var.aws_region
          "metrics" = [
            ["AWS/EFS", "BurstCreditBalance", "FileSystemId", aws_efs_file_system.lambda_efs.id]
          ]
          "stat" = "Average"
        }
      },
      {
        "type"   = "metric"
        "x"      = 6
        "y"      = 0
        "width"  = 6
        "height" = 6
        "properties" = {
          "title"  = "ClientConnections"
          "region" = var.aws_region
          "metrics" = [
            ["AWS/EFS", "ClientConnections", "FileSystemId", aws_efs_file_system.lambda_efs.id]
          ]
          "stat" = "Average"
        }
      },
      {
        "type"   = "metric"
        "x"      = 0
        "y"      = 6
        "width"  = 6
        "height" = 6
        "properties" = {
          "title"  = "DataReadIOBytes"
          "region" = var.aws_region
          "metrics" = [
            ["AWS/EFS", "DataReadIOBytes", "FileSystemId", aws_efs_file_system.lambda_efs.id]
          ]
          "stat" = "Sum"
        }
      },
      {
        "type"   = "metric"
        "x"      = 6
        "y"      = 6
        "width"  = 6
        "height" = 6
        "properties" = {
          "title"  = "DataWriteIOBytes"
          "region" = var.aws_region
          "metrics" = [
            ["AWS/EFS", "DataWriteIOBytes", "FileSystemId", aws_efs_file_system.lambda_efs.id]
          ]
          "stat" = "Sum"
        }
      },
      {
        "type"   = "metric"
        "x"      = 0
        "y"      = 12
        "width"  = 6
        "height" = 6
        "properties" = {
          "title"  = "PercentIOLimit"
          "region" = var.aws_region
          "metrics" = [
            ["AWS/EFS", "PercentIOLimit", "FileSystemId", aws_efs_file_system.lambda_efs.id]
          ]
          "stat" = "Average"
        }
      },
      {
        "type"   = "metric"
        "x"      = 6
        "y"      = 12
        "width"  = 6
        "height" = 6
        "properties" = {
          "title"  = "TotalIOBytes"
          "region" = var.aws_region
          "metrics" = [
            ["AWS/EFS", "TotalIOBytes", "FileSystemId", aws_efs_file_system.lambda_efs.id]
          ]
          "stat" = "Sum"
        }
      }
    ]
  })
}
