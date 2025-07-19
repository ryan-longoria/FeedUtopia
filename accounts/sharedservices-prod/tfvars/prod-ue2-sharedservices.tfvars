################################################################################
## Account Specific Variables
################################################################################

project_name               = "sharedservices"
aws_region                 = "us-east-2"
environment                = "prod"
s3_bucket_name             = "prod-sharedservices-media-bucket"
terraform_backend_bucket   = "prod-sharedservices-backend-bucket"
render_video_image_uri     = "825765422855.dkr.ecr.us-east-2.amazonaws.com/render_video_repository@sha256:9cd9a8fa7928c87e28a7fe11f51c84f582f835cd8014c664b924d848b08a71b0"
weekly_recap_image_uri     = "825765422855.dkr.ecr.us-east-2.amazonaws.com/weekly_news_recap_repository@sha256:1f176b7789a7b5031d7688948441576a62b27f95ee8508b25c13e8e9e38f1277"
vpc_cidr                   = "10.1.0.0/16"
aws_availability_zones     = ["us-east-2a", "us-east-2b"]
gpt_model                  = "gpt-4.1"