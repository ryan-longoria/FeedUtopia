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
