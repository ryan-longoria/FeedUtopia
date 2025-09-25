################################################################################
## API Gateway
################################################################################

#############################
# HTTP API + CORS
#############################

resource "aws_apigatewayv2_api" "http" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = var.allowed_origins
    allow_methods = ["GET","POST","PUT","PATCH","DELETE","OPTIONS"]
    allow_headers     = ["Authorization", "Content-Type"]
    expose_headers    = ["content-type","etag"]
    max_age           = 3000
    allow_credentials = true
  }
}

#############################
# Authorizer (Cognito JWT)
#############################

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

#############################
# Integrations (Lambda targets)
#############################

resource "aws_apigatewayv2_integration" "api_lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "presign_lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.presign.arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "upload_url_integration" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.upload_url.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 15000
}

#############################
# Routes
#############################

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

resource "aws_apigatewayv2_route" "get_wrestlers_me" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /profiles/wrestlers/me"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "get_tryouts_mine" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /tryouts/mine"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "get_wrestler_by_handle" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /profiles/wrestlers/{handle}"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "put_wrestlers_me" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "PUT /profiles/wrestlers/me"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "post_profile_avatar_presign" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /profiles/wrestlers/me/photo-url"
  target             = "integrations/${aws_apigatewayv2_integration.presign_lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "put_promoter" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "PUT /profiles/promoters"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "patch_promoter" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "PATCH /profiles/promoters"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "get_promoter_me" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /profiles/promoters/me"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "get_promoter_public" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /profiles/promoters/{userId}"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "NONE"
}

resource "aws_apigatewayv2_route" "upload_url_route" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /media/upload-url"
  target             = "integrations/${aws_apigatewayv2_integration.upload_url_integration.id}"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  authorization_type = "JWT"
}

resource "aws_apigatewayv2_route" "get_promoter_tryouts" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /profiles/promoters/{userId}/tryouts"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "NONE"
}

#############################
# Stage
#############################

resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true
}