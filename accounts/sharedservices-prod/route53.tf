################################################################################
## Route53 and ACM
################################################################################

data "aws_acm_certificate" "api_cert" {
  domain   = "api.feedutopia.com"
  statuses = ["ISSUED"]
}

data "aws_route53_zone" "feedutopia_zone" {
  name         = "feedutopia.com."
  private_zone = false
}

resource "aws_route53_record" "api_feedutopia_alias" {
  zone_id = data.aws_route53_zone.feedutopia_zone.zone_id
  name    = "api.feedutopia.com"
  type    = "A"

  alias {
    name                   = aws_api_gateway_domain_name.api_feedutopia_domain.regional_domain_name
    zone_id                = aws_api_gateway_domain_name.api_feedutopia_domain.regional_zone_id
    evaluate_target_health = false
  }
}