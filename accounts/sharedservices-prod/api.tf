################################################################################
## API Gateway
################################################################################

resource "aws_api_gateway_rest_api" "api" {
  name = "CrossAccountStateMachineAPI"
}

resource "aws_api_gateway_deployment" "api_deployment" {
  rest_api_id = aws_api_gateway_rest_api.api.id

  depends_on = [
    aws_api_gateway_integration.start_execution_integration
  ]
}

resource "aws_api_gateway_stage" "api_stage" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  deployment_id = aws_api_gateway_deployment.api_deployment.id
  stage_name    = "prod"
}

resource "aws_api_gateway_domain_name" "api_feedutopia_domain" {
  domain_name     = "api.feedutopia.com"
  certificate_arn = data.aws_acm_certificate.api_cert.arn

  endpoint_configuration {
    types = ["REGIONAL"]
  }
}

resource "aws_api_gateway_base_path_mapping" "api_base_mapping" {
  domain_name = aws_api_gateway_domain_name.api_feedutopia_domain.domain_name
  api_id     = aws_api_gateway_rest_api.api.id
  stage_name = aws_api_gateway_stage.api_stage.stage_name
}

resource "aws_api_gateway_resource" "start_execution" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "start-execution"
}

resource "aws_api_gateway_method" "start_execution_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.start_execution.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "start_execution_integration" {
  rest_api_id            = aws_api_gateway_rest_api.api.id
  resource_id            = aws_api_gateway_resource.start_execution.id
  http_method            = aws_api_gateway_method.start_execution_post.http_method
  integration_http_method = "POST"
  type                   = "AWS_PROXY"
  uri                    = aws_lambda_function.api_router.invoke_arn
}