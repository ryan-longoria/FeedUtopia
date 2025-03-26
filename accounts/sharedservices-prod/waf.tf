###############################################################################
# AWS WAF
###############################################################################

resource "aws_wafv2_web_acl" "api_waf" {
  name        = "apigw-waf"
  description = "WAF for API Gateway"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSCommonRules"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      sampled_requests_enabled    = true
      cloudwatch_metrics_enabled  = true
      metric_name                = "awsCommonRules"
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "apigw-waf"
    sampled_requests_enabled   = true
  }
}

resource "aws_wafv2_web_acl_association" "api_waf_assoc" {
  resource_arn = "arn:aws:apigateway:${var.aws_region}::/restapis/${aws_api_gateway_rest_api.api.id}/stages/${aws_api_gateway_stage.api_stage.stage_name}"
  web_acl_arn  = aws_wafv2_web_acl.api_waf.arn
}