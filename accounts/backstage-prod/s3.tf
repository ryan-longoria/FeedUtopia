resource "aws_s3_bucket" "techdocs" {
  bucket = "backstage-techdocs-feedutopia"
  tags   = { Name = "backstage-techdocs-bucket" }
}

resource "aws_s3_bucket_acl" "techdocs_acl" {
  bucket = aws_s3_bucket.techdocs.id
  acl    = "private"
}

resource "aws_s3_bucket_versioning" "techdocs_versioning" {
  bucket = aws_s3_bucket.techdocs.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "techdocs_encryption" {
  bucket = aws_s3_bucket.techdocs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "techdocs_block" {
  bucket                  = aws_s3_bucket.techdocs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
