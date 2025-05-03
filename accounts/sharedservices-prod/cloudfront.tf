################################################################################
## Cloudfront
################################################################################

resource "aws_cloudfront_distribution" "privacy_distribution" {
    origin {
        domain_name = aws_s3_bucket_website_configuration.privacy_website.website_endpoint
        origin_id   = "S3-privacy-feedutopia"

        custom_origin_config {
            http_port              = 80
            https_port             = 443
            origin_protocol_policy = "http-only"
            origin_ssl_protocols   = ["TLSv1", "TLSv1.1", "TLSv1.2"]
        }
    }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "privacy.html"

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-privacy-feedutopia"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  price_class = "PriceClass_100"

  viewer_certificate {
    acm_certificate_arn            = "arn:aws:acm:us-east-1:825765422855:certificate/3d0632d0-0f52-4731-aa7d-8f2d9b6bbe87"
    ssl_support_method             = "sni-only"
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
}