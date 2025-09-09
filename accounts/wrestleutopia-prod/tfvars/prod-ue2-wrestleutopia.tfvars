################################################################################
## Account Specific Variables
################################################################################

project_name             = "wrestleutopia"
aws_region               = "us-east-2"
s3_bucket_name           = "prod-wrestleutopia-media-bucket"
environment              = "prod"
terraform_backend_bucket = "prod-wrestleutopia-backend-bucket"
callback_urls            = ["https://wrestleutopia.com/auth/callback", "http://localhost:5173/"]
logout_urls              = ["https://wrestleutopia.com/"]
allowed_origins          = ["https://wrestleutopia.com", "https://www.wrestleutopia.com"]
cognito_user_pool_id     = "us-east-2_9oCzdeOZF"
cognito_user_pool_client_id = "6f4qoincbfm9g0lifod7q8nuhg"