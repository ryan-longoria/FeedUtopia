################################################################################
## Account Specific Variables
################################################################################

project_name             = "wrestleutopia"
aws_region               = "us-east-2"
s3_bucket_name           = "prod-wrestleutopia-media-bucket"
environment              = "prod"
terraform_backend_bucket = "prod-wrestleutopia-backend-bucket"
schedule_expression      = "rate(5 minutes)"
callback_urls            = ["https://wrestleutopia.com/auth/callback", "http://localhost:5173/"]
logout_urls              = ["https://wrestleutopia.com/"]