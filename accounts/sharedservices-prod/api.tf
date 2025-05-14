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

resource "aws_api_gateway_resource" "upload_url" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "upload-url"
}

resource "aws_api_gateway_method" "upload_url_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.upload_url.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "upload_url_int" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.upload_url.id
  http_method             = aws_api_gateway_method.upload_url_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.generate_upload_url.invoke_arn
}

resource "aws_api_gateway_resource" "submit" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "submit"
}

resource "aws_api_gateway_method" "submit_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.submit.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "submit_int" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.submit.id
  http_method             = aws_api_gateway_method.submit_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.create_feed_post.invoke_arn
}

resource "aws_api_gateway_method" "upload_url_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.upload_url.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "upload_url_options_mock" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.upload_url.id
  http_method = aws_api_gateway_method.upload_url_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "upload_url_options_response" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.upload_url.id
  http_method = aws_api_gateway_method.upload_url_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "upload_url_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.upload_url.id
  http_method = aws_api_gateway_method.upload_url_options.http_method
  status_code = aws_api_gateway_method_response.upload_url_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

resource "aws_api_gateway_method" "submit_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.submit.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "submit_options_mock" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.submit.id
  http_method = aws_api_gateway_method.submit_options.http_method
  type        = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "submit_options_response" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.submit.id
  http_method = aws_api_gateway_method.submit_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "submit_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.submit.id
  http_method = aws_api_gateway_method.submit_options.http_method
  status_code = aws_api_gateway_method_response.submit_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

resource "aws_api_gateway_resource" "kb_upload_url" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "kb"
}
resource "aws_api_gateway_resource" "kb_upload_url_child" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.kb_upload_url.id
  path_part   = "upload-url"
}
resource "aws_api_gateway_method" "kb_upload_url_post" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.kb_upload_url_child.id
  http_method = "POST"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "kb_upload_url_integration" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.kb_upload_url_child.id
  http_method             = aws_api_gateway_method.kb_upload_url_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.kb_presign.invoke_arn
}

resource "aws_api_gateway_method" "kb_list_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.kb_upload_url.id
  http_method   = "GET"
  authorization = "NONE"
}
resource "aws_api_gateway_integration" "kb_list_integration" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.kb_upload_url.id
  http_method             = aws_api_gateway_method.kb_list_get.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.kb_list.invoke_arn
}

resource "aws_api_gateway_method" "kb_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.kb_upload_url.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "kb_options_mock" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.kb_upload_url.id
  http_method             = aws_api_gateway_method.kb_options.http_method
  type                    = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "kb_options_response" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.kb_upload_url.id
  http_method = aws_api_gateway_method.kb_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "kb_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.kb_upload_url.id
  http_method = aws_api_gateway_method.kb_options.http_method
  status_code = aws_api_gateway_method_response.kb_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'"
    "method.response.header.Access-Control-Allow-Methods" = "'GET,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

resource "aws_api_gateway_method" "kb_upload_url_options" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.kb_upload_url_child.id
  http_method   = "OPTIONS"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "kb_upload_url_options_mock" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.kb_upload_url_child.id
  http_method             = aws_api_gateway_method.kb_upload_url_options.http_method
  type                    = "MOCK"

  request_templates = {
    "application/json" = "{\"statusCode\": 200}"
  }
}

resource "aws_api_gateway_method_response" "kb_upload_url_options_response" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.kb_upload_url_child.id
  http_method = aws_api_gateway_method.kb_upload_url_options.http_method
  status_code = "200"

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = true
    "method.response.header.Access-Control-Allow-Methods" = true
    "method.response.header.Access-Control-Allow-Origin"  = true
  }
}

resource "aws_api_gateway_integration_response" "kb_upload_url_options_integration_response" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.kb_upload_url_child.id
  http_method = aws_api_gateway_method.kb_upload_url_options.http_method
  status_code = aws_api_gateway_method_response.kb_upload_url_options_response.status_code

  response_parameters = {
    "method.response.header.Access-Control-Allow-Headers" = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key'"
    "method.response.header.Access-Control-Allow-Methods" = "'POST,OPTIONS'"
    "method.response.header.Access-Control-Allow-Origin"  = "'*'"
  }
}

#############################
# Instagram API Callback/Oauth
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
  api_id                 = aws_apigatewayv2_api.instagram_api.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.ig_webhook_handler.invoke_arn
  payload_format_version = "2.0"
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

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.instagram_api_logs.arn
    format = jsonencode({
      requestId = "$context.requestId"
      ip        = "$context.identity.sourceIp"
      method    = "$context.httpMethod"
      path      = "$context.routeKey"
      status    = "$context.status"
      error     = "$context.error.message"
    })
  }
}

resource "aws_apigatewayv2_integration" "oauth_integration" {
  api_id                 = aws_apigatewayv2_api.instagram_api.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.instagram_oauth.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "instagram_auth_callback" {
  api_id    = aws_apigatewayv2_api.instagram_api.id
  route_key = "GET /instagram/auth/callback"
  target    = "integrations/${aws_apigatewayv2_integration.oauth_integration.id}"
}
