################################################################################
## Locals
################################################################################

locals {
  project           = "${var.project_name}-prod"
  TEAMS_WEBHOOK_URL = var.teams_webhooks[var.project_name].auto
  user_pool_name    = "${var.project_name}-user-pool"
  s3_origin_domain  = "${aws_s3_bucket.media_bucket.bucket}.s3.${var.aws_region}.amazonaws.com"
}