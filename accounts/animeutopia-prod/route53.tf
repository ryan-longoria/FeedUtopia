################################################################################
## Route 53
################################################################################

data "aws_route53_zone" "accountstore" {
  name       = "animeutopiastore.com."
  private_zone = false
}

resource "aws_route53_record" "account_domain_a" {
  zone_id  = data.aws_route53_zone.animeutopiastore.zone_id
  name     = "animeutopiastore.com"
  type     = "A"
  ttl      = 300
  records  = [aws_lightsail_static_ip.ecommerce_ip.ip_address]
}