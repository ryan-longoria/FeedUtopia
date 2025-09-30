################################################################################
## Cloudtrail
################################################################################

resource "aws_cloudtrail" "media_trail" {
  name                          = "wutopia-media-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail_logs.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_logging                = true

  advanced_event_selector {
    name = "S3WriteEventsForMedia"
    field_selector {
      field  = "eventCategory"
      equals = ["Data"]
    }
    field_selector {
      field  = "resources.type"
      equals = ["AWS::S3::Object"]
    }
    field_selector {
      field  = "readOnly"
      equals = ["false"]
    }
    field_selector {
      field  = "resources.ARN"
      starts_with = ["${aws_s3_bucket.media_bucket.arn}/raw/"]
    }
  }
}
