################################################################################
## X-Ray
################################################################################

resource "aws_xray_sampling_rule" "critical_service_rule" {
  rule_name      = "CriticalService"
  priority       = 10
  reservoir_size = 2
  fixed_rate     = 1.0
  host           = "*"
  http_method    = "*"
  service_name   = "critical"
  service_type   = "*"
  url_path       = "*"
  version        = 1
  resource_arn   = "*"
}

resource "aws_xray_sampling_rule" "fallback_rule" {
  rule_name      = "Fallback"
  priority       = 9999
  version        = 1
  reservoir_size = 1
  fixed_rate     = 0.05
  url_path       = "*"
  host           = "*"
  http_method    = "*"
  service_type   = "*"
  service_name   = "*"
  resource_arn   = "*"
}

resource "aws_xray_group" "production_group" {
  group_name        = "ProductionTraces"
  filter_expression = "annotation.stage = \"prod\""
}