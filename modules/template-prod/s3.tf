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
