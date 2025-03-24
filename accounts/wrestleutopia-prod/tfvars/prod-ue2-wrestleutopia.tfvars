################################################################################
## Account Specific Variables
################################################################################

project_name             = "wrestleutopia"
aws_region               = "us-east-2"
s3_bucket_name           = "prod-wrestleutopia-media-bucket"
environment              = "prod"
terraform_backend_bucket = "prod-wrestleutopia-backend-bucket"
render_video_image_uri   = "390402544450.dkr.ecr.us-east-2.amazonaws.com/render_video_repository@sha256:f086ed8f34c3927cdcf8de57a2a548528177999888f2e9d6d76b469c60d149ac"
schedule_expression      = "rate(5 minutes)"
vpc_cidr                 = "10.1.0.0/16"
aws_availability_zones   = ["us-east-2a", "us-east-2b"]
public_subnet_count      = 2