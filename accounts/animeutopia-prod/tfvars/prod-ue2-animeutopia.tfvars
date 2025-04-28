################################################################################
## Account Specific Variables
################################################################################

project_name             = "animeutopia"
aws_region               = "us-east-2"
s3_bucket_name           = "prod-animeutopia-media-bucket"
environment              = "prod"
terraform_backend_bucket = "prod-animeutopia-backend-bucket"
schedule_expression      = "rate(5 minutes)"
domain                   = "sheanime.com"