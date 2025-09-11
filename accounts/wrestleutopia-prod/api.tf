################################################################################
## API Gateway
################################################################################

resource "aws_apigatewayv2_api" "http" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["GET","POST","PUT","PATCH","DELETE","OPTIONS"]
    allow_headers = ["authorization","Authorization","content-type"]
    expose_headers = ["content-type"]
    max_age = 3600
    }
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.http.id
  name             = "cognito-jwt"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  jwt_configuration {
    audience = [var.cognito_user_pool_client_id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${var.cognito_user_pool_id}"
  }
}

resource "aws_apigatewayv2_integration" "api_lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_integration" "presign_lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.presign.arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_route" "get_tryouts" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /tryouts"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "post_tryouts" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /tryouts"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "delete_tryout" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "DELETE /tryouts/{tryoutId}"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "get_wrestlers" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /profiles/wrestlers"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "post_wrestlers" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /profiles/wrestlers"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "get_promoter" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /profiles/promoters"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "post_promoter" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /profiles/promoters"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "get_apps" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /applications"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "post_apps" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /applications"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "presign" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /s3/presign"
  target             = "integrations/${aws_apigatewayv2_integration.presign_lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "get_tryout_by_id" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /tryouts/{tryoutId}"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "NONE"
}
