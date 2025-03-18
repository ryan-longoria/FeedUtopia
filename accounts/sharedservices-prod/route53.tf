data "aws_acm_certificate" "api_cert" {
  domain   = "api.feedutopia.com"
  statuses = ["ISSUED"]
}

data "aws_route53_zone" "feedutopia_zone" {
  name         = "feedutopia.com."
  private_zone = false
}
