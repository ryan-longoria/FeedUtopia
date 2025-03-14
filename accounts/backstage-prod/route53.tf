resource "aws_route53_zone" "feedutopia" {
  name = "feedutopia.com"
}

resource "aws_acm_certificate" "cert" {
  domain_name       = "backstage.feedutopia.com"
  validation_method = "DNS"
}

resource "aws_route53_record" "cert_validation" {
  name    = tolist(aws_acm_certificate.cert.domain_validation_options)[0].resource_record_name
  type    = tolist(aws_acm_certificate.cert.domain_validation_options)[0].resource_record_type
  zone_id = aws_route53_zone.feedutopia.zone_id
  records = [tolist(aws_acm_certificate.cert.domain_validation_options)[0].resource_record_value]
  ttl     = 60
}

resource "aws_route53_record" "backstage_domain" {
  zone_id = aws_route53_zone.feedutopia.zone_id
  name    = "backstage.feedutopia.com"
  type    = "A"

  alias {
    name                   = aws_lb.frontend.dns_name
    zone_id                = aws_lb.frontend.zone_id
    evaluate_target_health = true
  }
}
