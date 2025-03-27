################################################################################
## Account Specific Variables
################################################################################

project_name             = "driftutopia"
aws_region               = "us-east-2"
s3_bucket_name           = "prod-driftutopia-media-bucket"
environment              = "prod"
terraform_backend_bucket = "prod-driftutopia-backend-bucket"
schedule_expression      = "rate(5 minutes)"