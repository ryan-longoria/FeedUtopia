################################################################################
## Account Specific Variables
################################################################################

project_name             = "project"
aws_region               = "us-east-2"
s3_bucket_name           = "prod-project-media-bucket"
environment              = "prod"
terraform_backend_bucket = "prod-project-backend-bucket"
schedule_expression      = "rate(5 minutes)"