################################################################################
## Account Specific Variables
################################################################################

project_name               = "sharedservices"
aws_region                 = "us-east-2"
environment                = "prod"
s3_bucket_name             = "prod-sharedservices-media-bucket"
terraform_backend_bucket   = "prod-sharedservices-backend-bucket"
render_video_image_uri     = "825765422855.dkr.ecr.us-east-2.amazonaws.com/render_video_repository@sha256:6c5ba74836f1a613884b69d60a59d8f3ebb51684923ae84b94282b4a10d19ec9"
weekly_recap_image_uri     = "825765422855.dkr.ecr.us-east-2.amazonaws.com/weekly_news_recap_repository@sha256:596b82b56e0425b92a14ef6110b111df7d5edd1c4e97599dc7f970724dc5fb53"
vpc_cidr                   = "10.1.0.0/16"
aws_availability_zones     = ["us-east-2a", "us-east-2b"]
gpt_model                  = "gpt-4.1"