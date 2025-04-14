################################################################################
## Account Specific Variables
################################################################################

project_name             = "xputopia"
aws_region               = "us-east-2"
s3_bucket_name           = "prod-xputopia-media-bucket"
environment              = "prod"
terraform_backend_bucket = "prod-xputopia-backend-bucket"
schedule_expression      = "rate(5 minutes)"