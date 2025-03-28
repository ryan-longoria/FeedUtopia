################################################################################
## Account Specific Variables
################################################################################

project_name               = "sharedservices"
aws_region                 = "us-east-2"
environment                = "prod"
s3_bucket_name             = "prod-sharedservices-media-bucket"
terraform_backend_bucket   = "prod-sharedservices-backend-bucket"
render_video_image_uri     = "825765422855.dkr.ecr.us-east-2.amazonaws.com/render_video_repository@sha256:86f29a39d4f208f722a3fd14c762a3240b811550c3e9793b86f74d127affb3d4"
vpc_cidr                   = "10.1.0.0/16"
aws_availability_zones     = ["us-east-2a", "us-east-2b"]
