###############################################################################
# API Gateway
###############################################################################

resource "aws_apigatewayv2_api" "ann_proxy" {
  name          = "${var.project_name}-ann-proxy"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "ann_proxy_integration" {
  api_id                 = aws_apigatewayv2_api.ann_proxy.id
  integration_type       = "HTTP_PROXY"
  integration_method     = "ANY"
  integration_uri        = "https://www.animenewsnetwork.com"
  payload_format_version = "1.0"
  timeout_milliseconds   = 10000
}

resource "aws_apigatewayv2_route" "ann_proxy_route" {
  api_id    = aws_apigatewayv2_api.ann_proxy.id
  route_key = "ANY /newsroom/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.ann_proxy_integration.id}"
}

resource "aws_apigatewayv2_stage" "ann_proxy_stage" {
  api_id      = aws_apigatewayv2_api.ann_proxy.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_domain_name" "ann_domain" {
  domain_name = "rss.${var.domain}"

  domain_name_configuration {
    certificate_arn = aws_acm_certificate.ann_proxy_cert.arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "ann_mapping" {
  api_id      = aws_apigatewayv2_api.ann_proxy.id
  domain_name = aws_apigatewayv2_domain_name.ann_domain.id
  stage       = aws_apigatewayv2_stage.ann_proxy_stage.id
}