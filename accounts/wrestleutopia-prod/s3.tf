################################################################################
## Simple Storage Service (S3)
################################################################################

##################################################
# Media bucket (primary)
##################################################

resource "aws_s3_bucket" "media_bucket" {
  bucket = var.s3_bucket_name
}

#############################
# Baseline security & ownership
#############################

resource "aws_s3_bucket_ownership_controls" "media" {
  bucket = aws_s3_bucket.media_bucket.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media_bucket.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "media_bucket_encryption" {
  bucket = aws_s3_bucket.media_bucket.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = false
  }
}

resource "aws_s3_bucket_versioning" "media_bucket_versioning" {
  bucket = aws_s3_bucket.media_bucket.id
  versioning_configuration { status = "Enabled" }
}

#############################
# CORS
#############################

resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media_bucket.id

  cors_rule {
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = ["https://www.wrestleutopia.com"]
    allowed_headers = ["authorization", "cache-control", "content-type", "x-amz-*", "Content-MD5", "content-md5"]
    expose_headers  = ["ETag"]
    max_age_seconds = 600
  }
}

#############################
# Lifecycle rules
#############################

resource "aws_s3_bucket_lifecycle_configuration" "media_bucket_lifecycle" {
  bucket = aws_s3_bucket.media_bucket.id

  rule {
    id     = "delete_posts_after_1_week"
    status = "Enabled"
    filter { prefix = "posts/" }
    expiration { days = 7 }
    noncurrent_version_expiration { noncurrent_days = 7 }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }

  rule {
    id     = "raw_uploads_expire_7d"
    status = "Enabled"
    filter { prefix = "raw/uploads/" }
    expiration { days = 7 }
    noncurrent_version_expiration { noncurrent_days = 7 }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }

  rule {
    id     = "public_wrestlers_images_tiering"
    status = "Enabled"
    filter { prefix = "public/wrestlers/images/" }
    transition {
      days          = 0
      storage_class = "INTELLIGENT_TIERING"
    }
    noncurrent_version_expiration { noncurrent_days = 30 }
  }

  rule {
    id     = "public_promoters_images_tiering"
    status = "Enabled"
    filter { prefix = "public/promoters/images/" }
    transition {
      days          = 0
      storage_class = "INTELLIGENT_TIERING"
    }
    noncurrent_version_expiration { noncurrent_days = 30 }
  }

  rule {
    id     = "public_wrestlers_gallery_tiering"
    status = "Enabled"
    filter { prefix = "public/wrestlers/gallery/" }
    transition {
      days          = 0
      storage_class = "INTELLIGENT_TIERING"
    }
    noncurrent_version_expiration { noncurrent_days = 30 }
  }

  rule {
    id     = "public_promoters_gallery_tiering"
    status = "Enabled"
    filter { prefix = "public/promoters/gallery/" }
    transition {
      days          = 0
      storage_class = "INTELLIGENT_TIERING"
    }
    noncurrent_version_expiration { noncurrent_days = 30 }
  }

  rule {
    id     = "public_wrestlers_highlights_tiering"
    status = "Enabled"
    filter { prefix = "public/wrestlers/highlights/" }
    transition {
      days          = 0
      storage_class = "INTELLIGENT_TIERING"
    }
    noncurrent_version_expiration { noncurrent_days = 30 }
  }

  rule {
    id     = "public_promoters_highlights_tiering"
    status = "Enabled"
    filter { prefix = "public/promoters/highlights/" }
    transition {
      days          = 0
      storage_class = "INTELLIGENT_TIERING"
    }
    noncurrent_version_expiration { noncurrent_days = 30 }
  }
}

#############################
# Notifications (EventBridge)
#############################

resource "aws_s3_bucket_notification" "media_notifications" {
  bucket      = aws_s3_bucket.media_bucket.id
  eventbridge = true
}

##################################################
# CloudTrail logs bucket
##################################################

resource "aws_s3_bucket" "cloudtrail_logs" {
  bucket = "${var.s3_bucket_name}-trail"
}

#############################
# Baseline security & ownership
#############################

resource "aws_s3_bucket_ownership_controls" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail_logs" {
  bucket                  = aws_s3_bucket.cloudtrail_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

#############################
# Lifecycle (compliance retention)
#############################

resource "aws_s3_bucket_lifecycle_configuration" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id

  rule {
    id     = "trail-compliance-7y"
    status = "Enabled"

    filter { prefix = "AWSLogs/" }

    transition {
      days          = 30
      storage_class = "GLACIER"
    }

    expiration { days = 365 * 7 }
  }
}