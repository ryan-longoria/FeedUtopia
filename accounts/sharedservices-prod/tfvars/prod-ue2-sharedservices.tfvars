################################################################################
## Account Specific Variables
################################################################################

project_name               = "sharedservices"
aws_region                 = "us-east-2"
environment                = "prod"
s3_bucket_name             = "prod-sharedservices-media-bucket"
terraform_backend_bucket   = "prod-sharedservices-backend-bucket"
render_video_image_uri     = "825765422855.dkr.ecr.us-east-2.amazonaws.com/render_video_repository@sha256:2996f9eefc3d16fbe12175f0c8c19646ea6ea5a6f61de6d543f63f10f43d9634"
weekly_recap_image_uri     = "825765422855.dkr.ecr.us-east-2.amazonaws.com/weekly_news_recap_repository@sha256:4e14ba23750826117ed0172b53a5fe4388aa9300e133ee37d87611019db32747"
render_carousel_image_uri  = "825765422855.dkr.ecr.us-east-2.amazonaws.com/render_carousel@sha256:fe5c3f4055cb07858e90b1476b777ef271562c090af22bb13c2f2dcf883f903d"
vpc_cidr                   = "10.1.0.0/16"
aws_availability_zones     = ["us-east-2a", "us-east-2b"]
gpt_model                  = "gpt-4.1"