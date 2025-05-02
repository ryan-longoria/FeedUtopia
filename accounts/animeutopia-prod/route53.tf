################################################################################
## Route 53
################################################################################

data "aws_route53_zone" "accountstore" {
  provider     = aws.dns
  name         = "animeutopiastore.com"
  private_zone = false
}

resource "aws_route53_record" "account_domain_a" {
  provider = aws.dns
  zone_id  = data.aws_route53_zone.accountstore.zone_id
  name     = "animeutopiastore.com"
  type     = "A"
  ttl      = 300
  records  = [aws_lightsail_static_ip.ecommerce_ip.ip_address]
}

resource "aws_acm_certificate" "ann_proxy_cert" {
  domain_name       = "rss.${var.domain}"
  validation_method = "DNS"
}

data "aws_route53_zone" "this" {
  name         = var.domain
  private_zone = false
}

resource "aws_route53_record" "ann_proxy_alias" {
  zone_id = data.aws_route53_zone.this.id
  name    = "rss.${var.domain}"
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.ann_domain.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.ann_domain.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "ann_proxy_alias_ipv6" {
  zone_id = data.aws_route53_zone.this.id
  name    = "rss.${var.domain}"
  type    = "AAAA"

  alias {
    name                   = aws_apigatewayv2_domain_name.ann_domain.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.ann_domain.domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}