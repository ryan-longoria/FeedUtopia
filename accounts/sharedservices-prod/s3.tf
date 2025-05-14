################################################################################
## Simple Storage Service (S3)
################################################################################


resource "aws_s3_bucket" "media_bucket" {
  bucket = var.s3_bucket_name
}

resource "aws_s3_bucket_versioning" "media_bucket_versioning" {
  bucket = aws_s3_bucket.media_bucket.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media_bucket_encryption" {
  bucket = aws_s3_bucket.media_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = "alias/aws/s3"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media_bucket_lifecycle" {
  bucket = aws_s3_bucket.media_bucket.id

  rule {
    id = "delete_posts_after_1_week"
    filter {
      prefix = "posts/"
    }

    status = "Enabled"

    expiration {
      days = 7
    }
  }
}

resource "aws_s3_bucket" "privacy_bucket" {
  bucket = "feedutopia-privacy"
  tags = {
    Name        = "FeedUtopia Privacy Policy"
    Environment = "Production"
  }
}

resource "aws_s3_object" "privacy_html" {
  bucket       = aws_s3_bucket.privacy_bucket.id
  key          = "privacy.html"
  source       = "artifacts/websites/ig_privacy_policy/privacy.html"
  content_type = "text/html"
}

resource "aws_s3_bucket_website_configuration" "privacy_website" {
  bucket = aws_s3_bucket.privacy_bucket.id

  index_document {
    suffix = "privacy.html"
  }
}

resource "aws_s3_bucket_policy" "privacy_policy" {
  bucket = aws_s3_bucket.privacy_bucket.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect    = "Allow",
        Principal = "*",
        Action    = "s3:GetObject",
        Resource  = "${aws_s3_bucket.privacy_bucket.arn}/*"
      }
    ]
  })
}

resource "aws_s3_bucket" "feedutopia-webapp" {
  bucket        = "feedutopia-webapp"
  force_destroy = true
}

resource "aws_s3_bucket_policy" "feedutopia_webapp_oac" {
  bucket = aws_s3_bucket.feedutopia-webapp.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Sid       = "AllowCloudFrontOAC"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.feedutopia-webapp.arn}/*"

      Condition = {
        StringEquals = {
          "AWS:SourceArn"      = aws_cloudfront_distribution.feedutopia-web.arn
          "AWS:SourceAccount"  = data.aws_caller_identity.current.account_id
        }
      }
    }]
  })
}


resource "aws_s3_bucket_cors_configuration" "artifacts_cors" {
  bucket = "prod-sharedservices-artifacts-bucket"

  cors_rule {
    allowed_methods = ["GET", "PUT", "HEAD", "POST"]
    allowed_origins = ["https://feedutopia.com"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

resource "aws_s3_bucket_policy" "feedutopia_webapp_kb_write" {
  bucket = aws_s3_bucket.feedutopia-webapp.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Sid      = "AllowLambdaWriteKB"
      Effect   = "Allow"
      Action   = ["s3:PutObject", "s3:PutObjectAcl"]
      Resource = "${aws_s3_bucket.feedutopia-webapp.arn}/kb/*"
      Principal = { AWS = aws_iam_role.lambda_role.arn }
    }]
  })
}