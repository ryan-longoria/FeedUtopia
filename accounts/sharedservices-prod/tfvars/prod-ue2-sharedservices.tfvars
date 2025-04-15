################################################################################
## Account Specific Variables
################################################################################

project_name               = "sharedservices"
aws_region                 = "us-east-2"
environment                = "prod"
s3_bucket_name             = "prod-sharedservices-media-bucket"
terraform_backend_bucket   = "prod-sharedservices-backend-bucket"
render_video_image_uri     = "825765422855.dkr.ecr.us-east-2.amazonaws.com/render_video_repository@sha256:2f1aa00ac9c46cd4e7ac806698e1f19d5ec47b2103fd454496f018ac336a7d5f"
vpc_cidr                   = "10.1.0.0/16"
aws_availability_zones     = ["us-east-2a", "us-east-2b"]
