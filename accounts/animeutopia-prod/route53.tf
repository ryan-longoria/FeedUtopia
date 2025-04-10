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