################################################################################
## Cloudfront
################################################################################

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
    response_headers_policy_id = aws_cloudfront_response_headers_policy.csp_base.id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    forwarded_values {
      query_string = true
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

resource "aws_cloudfront_response_headers_policy" "csp_base" {
  name = "wrestleutopia-csp-base"

  security_headers_config {
    content_security_policy {
      override                 = true
      content_security_policy  = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://go2gft4394.execute-api.us-east-2.amazonaws.com https://wrestleutopia-auth.auth.us-east-2.amazoncognito.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; worker-src 'self'; upgrade-insecure-requests;"
    }

    content_type_options {
      override = true
    }

    strict_transport_security {
      override                   = true
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
    }

    referrer_policy {
      override        = true
      referrer_policy = "strict-origin-when-cross-origin"
    }

    frame_options {
      override        = true
      frame_option    = "DENY"
    }

    xss_protection {
      override   = true
      mode_block = true
      protection = true
      report_uri = null
    }
  }

  custom_headers_config {
    items {
      header   = "Permissions-Policy"
      value    = "geolocation=(), microphone=(), camera=(), payment=(), fullscreen=(self)"
      override = true
    }
    items {
      header   = "Cross-Origin-Opener-Policy"
      value    = "same-origin"
      override = true
    }
    items {
      header   = "Cross-Origin-Embedder-Policy"
      value    = "require-corp"
      override = true
    }
  }
}