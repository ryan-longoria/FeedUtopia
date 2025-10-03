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
    allow_origins     = var.allowed_origins
    allow_methods     = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers     = ["Authorization", "Content-Type", "Content-MD5", "content-md5"]
    expose_headers    = ["content-type", "etag"]
    max_age           = 3000
    allow_credentials = false
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
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_integration" "presign_lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.presign.invoke_arn
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
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "post_tryouts" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /tryouts"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "delete_tryout" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "DELETE /tryouts/{tryoutId}"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "get_wrestlers" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /profiles/wrestlers"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "post_wrestlers" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /profiles/wrestlers"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "get_promoter" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /profiles/promoters"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "post_promoter" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /profiles/promoters"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "get_apps" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /applications"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "post_apps" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /applications"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "presign" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /s3/presign"
  target             = "integrations/${aws_apigatewayv2_integration.presign_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "get_tryout_by_id" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /tryouts/{tryoutId}"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "get_wrestlers_me" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /profiles/wrestlers/me"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "get_tryouts_mine" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /tryouts/mine"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "get_wrestler_by_handle" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /profiles/wrestlers/{handle}"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "put_wrestlers_me" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "PUT /profiles/wrestlers/me"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "post_profile_avatar_presign" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /profiles/wrestlers/me/photo-url"
  target             = "integrations/${aws_apigatewayv2_integration.presign_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "put_promoter" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "PUT /profiles/promoters"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "patch_promoter" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "PATCH /profiles/promoters"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "get_promoter_me" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /profiles/promoters/me"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "get_promoter_public" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /profiles/promoters/{userId}"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "upload_url_route" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /media/upload-url"
  target             = "integrations/${aws_apigatewayv2_integration.upload_url_integration.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "get_promoter_tryouts" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /promoters/{userId}/tryouts"
  target             = "integrations/${aws_apigatewayv2_integration.api_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_route" "post_promoter_logo_presign" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /profiles/promoters/me/logo-url"
  target             = "integrations/${aws_apigatewayv2_integration.presign_lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

#############################
# Stage
#############################

resource "aws_apigatewayv2_stage" "prod" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access.arn
    format = jsonencode({
      requestId         = "$context.requestId"
      requestTime       = "$context.requestTime"
      httpMethod        = "$context.httpMethod"
      routeKey          = "$context.routeKey"
      path              = "$context.path"
      status            = "$context.status"
      responseLatencyMs = "$context.responseLatency"
      ip                = "$context.identity.sourceIp"
      userAgent         = "$context.identity.userAgent"
      jwtSub            = "$context.authorizer.jwt.claims.sub"
      clientId          = "$context.authorizer.jwt.claims.client_id"
    })
  }

  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 20
  }

  route_settings {
    route_key              = "GET /tryouts"
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }

  route_settings {
    route_key              = "GET /tryouts/{tryoutId}"
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }

  route_settings {
    route_key              = "GET /promoters/{userId}/tryouts"
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }

  route_settings {
    route_key              = "GET /profiles/promoters/{userId}"
    throttling_burst_limit = 10
    throttling_rate_limit  = 10
  }

  route_settings {
    route_key              = "GET /profiles/wrestlers/{handle}"
    throttling_burst_limit = 10
    throttling_rate_limit  = 10
  }

  route_settings {
    route_key              = "GET /profiles/wrestlers"
    throttling_burst_limit = 10
    throttling_rate_limit  = 10
  }

  route_settings {
    route_key              = "GET /profiles/wrestlers/me"
    throttling_burst_limit = 5
    throttling_rate_limit  = 5
  }

  route_settings {
    route_key              = "PUT /profiles/wrestlers/me"
    throttling_burst_limit = 5
    throttling_rate_limit  = 5
  }

  route_settings {
    route_key              = "POST /profiles/wrestlers"
    throttling_burst_limit = 5
    throttling_rate_limit  = 5
  }

  route_settings {
    route_key              = "GET /profiles/promoters"
    throttling_burst_limit = 5
    throttling_rate_limit  = 5
  }

  route_settings {
    route_key              = "GET /profiles/promoters/me"
    throttling_burst_limit = 5
    throttling_rate_limit  = 5
  }

  route_settings {
    route_key              = "PUT /profiles/promoters"
    throttling_burst_limit = 5
    throttling_rate_limit  = 5
  }

  route_settings {
    route_key              = "PATCH /profiles/promoters"
    throttling_burst_limit = 5
    throttling_rate_limit  = 5
  }

  route_settings {
    route_key              = "GET /applications"
    throttling_burst_limit = 5
    throttling_rate_limit  = 5
  }

  route_settings {
    route_key              = "POST /applications"
    throttling_burst_limit = 5
    throttling_rate_limit  = 5
  }

  route_settings {
    route_key              = "GET /tryouts/mine"
    throttling_burst_limit = 5
    throttling_rate_limit  = 5
  }

  route_settings {
    route_key              = "DELETE /tryouts/{tryoutId}"
    throttling_burst_limit = 5
    throttling_rate_limit  = 5
  }

  route_settings {
    route_key              = "GET /s3/presign"
    throttling_burst_limit = 5
    throttling_rate_limit  = 5
  }

  route_settings {
    route_key              = "POST /profiles/wrestlers/me/photo-url"
    throttling_burst_limit = 5
    throttling_rate_limit  = 5
  }

  route_settings {
    route_key              = "POST /media/upload-url"
    throttling_burst_limit = 5
    throttling_rate_limit  = 5
  }
}