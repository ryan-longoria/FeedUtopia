################################################################################
## Account Specific Variables
################################################################################

project_name               = "sharedservices"
aws_region                 = "us-east-2"
environment                = "prod"
s3_bucket_name             = "prod-sharedservices-media-bucket"
terraform_backend_bucket   = "prod-sharedservices-backend-bucket"
render_video_image_uri     = "825765422855.dkr.ecr.us-east-2.amazonaws.com/render_video_repository@sha256:9cd9a8fa7928c87e28a7fe11f51c84f582f835cd8014c664b924d848b08a71b0"
weekly_recap_image_uri     = "825765422855.dkr.ecr.us-east-2.amazonaws.com/weekly_news_recap_repository@sha256:4e14ba23750826117ed0172b53a5fe4388aa9300e133ee37d87611019db32747"
render_carousel_image_uri  = "825765422855.dkr.ecr.us-east-2.amazonaws.com/render_carousel@sha256:d696743d1de13c2ae65c404d29ed8e767870d6232f8d2f4181833da043a62656"
vpc_cidr                   = "10.1.0.0/16"
aws_availability_zones     = ["us-east-2a", "us-east-2b"]
gpt_model                  = "gpt-4.1"