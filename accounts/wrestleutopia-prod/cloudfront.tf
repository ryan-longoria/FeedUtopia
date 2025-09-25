resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "media-oac"
  description                       = "OAC for ${aws_s3_bucket.media_bucket.bucket}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "media" {
  enabled = true
  comment = "WrestleUtopia Media CDN"

  origin {
    domain_name = local.s3_origin_domain
    origin_id   = "media-s3-origin"

    s3_origin_config {
      origin_access_identity = ""
    }

    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  default_cache_behavior {
    target_origin_id       = "media-s3-origin"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }

  }

  price_class = "PriceClass_100"

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  depends_on = [aws_cloudfront_origin_access_control.media]
}