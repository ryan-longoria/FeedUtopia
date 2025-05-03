################################################################################
## API Gateway
################################################################################

#############################
# Utopium API
#############################

resource "aws_api_gateway_rest_api" "api" {
  name = "CrossAccountStateMachineAPI"

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_deployment" "api_deployment" {
  rest_api_id = aws_api_gateway_rest_api.api.id

  depends_on = [
    aws_api_gateway_integration.start_execution_integration,
    aws_api_gateway_method.start_execution_post
  ]
}

resource "aws_api_gateway_stage" "api_stage" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  deployment_id = aws_api_gateway_deployment.api_deployment.id
  stage_name    = "prod"

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw_access_logs.arn
    format = jsonencode({
      requestId      = "$context.requestId",
      ip             = "$context.identity.sourceIp",
      caller         = "$context.identity.caller",
      user           = "$context.identity.user",
      requestTime    = "$context.requestTime",
      httpMethod     = "$context.httpMethod",
      resourcePath   = "$context.resourcePath",
      status         = "$context.status",
      protocol       = "$context.protocol",
      responseLength = "$context.responseLength",
      errorMessage   = "$context.error.messageString"
    })
  }

  xray_tracing_enabled = true

  depends_on = [
    aws_api_gateway_deployment.api_deployment,
    aws_cloudwatch_log_group.apigw_access_logs,
    aws_api_gateway_account.apigw_account
  ]
}

resource "aws_api_gateway_domain_name" "api_feedutopia_domain" {
  domain_name              = "api.feedutopia.com"
  regional_certificate_arn = "arn:aws:acm:us-east-2:825765422855:certificate/8e28f7dc-9a39-43dc-b615-fcb4a8e4a2c8"

  endpoint_configuration {
    types = ["REGIONAL"]
  }

  security_policy = "TLS_1_2"
}

resource "aws_api_gateway_base_path_mapping" "api_base_mapping" {
  domain_name = aws_api_gateway_domain_name.api_feedutopia_domain.domain_name
  api_id      = aws_api_gateway_rest_api.api.id
  stage_name  = aws_api_gateway_stage.api_stage.stage_name
}

resource "aws_api_gateway_resource" "start_execution" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "start-execution"
}

resource "aws_api_gateway_method" "start_execution_post" {
  rest_api_id      = aws_api_gateway_rest_api.api.id
  resource_id      = aws_api_gateway_resource.start_execution.id
  http_method      = "POST"
  authorization    = "NONE"
  api_key_required = false
}

resource "aws_api_gateway_integration" "start_execution_integration" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.start_execution.id
  http_method             = aws_api_gateway_method.start_execution_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.start_sfn.invoke_arn
}

resource "aws_api_gateway_method_settings" "method_settings" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  stage_name  = aws_api_gateway_stage.api_stage.stage_name
  method_path = "*/*"

  settings {
    metrics_enabled        = true
    logging_level          = "INFO"
    data_trace_enabled     = true
    throttling_burst_limit = 100
    throttling_rate_limit  = 50
  }
}

resource "aws_api_gateway_usage_plan" "api_usage_plan" {
  name = "cross-account-api-usage-plan"

  throttle_settings {
    burst_limit = 100
    rate_limit  = 50
  }

  quota_settings {
    limit  = 100000
    period = "MONTH"
  }
}

resource "aws_api_gateway_api_key" "api_key" {
  name    = "CrossAccountStateMachineApiKey"
  enabled = true
}

#############################
# Instagram API Callback
#############################

resource "aws_api_gateway_usage_plan_key" "api_usage_plan_key" {
  key_id        = aws_api_gateway_api_key.api_key.id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.api_usage_plan.id
}

resource "aws_apigatewayv2_api" "instagram_api" {
  name          = "${var.project_name}-instagram-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "instagram_lambda_integration" {
  api_id                    = aws_apigatewayv2_api.instagram_api.id
  integration_type          = "AWS_PROXY"
  integration_method        = "POST"
  integration_uri           = aws_lambda_function.ig_webhook_handler.invoke_arn
  payload_format_version    = "2.0"
}

resource "aws_apigatewayv2_route" "instagram_webhook_route" {
  api_id    = aws_apigatewayv2_api.instagram_api.id
  route_key = "ANY /instagram/webhook"
  target    = "integrations/${aws_apigatewayv2_integration.instagram_lambda_integration.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.instagram_api.id
  name        = "$default"
  auto_deploy = true
}