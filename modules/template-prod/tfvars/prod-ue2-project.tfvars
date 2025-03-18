################################################################################
## Account Specific Variables
################################################################################

project_name               = "project"
aws_account_ids            = { type = object({ project = string }) }
aws_region                 = "us-east-2"
s3_bucket_name             = "prod-project-media-bucket"
environment                = "prod"
terraform_backend_bucket   = "prod-project-backend-bucket"
teams_webhook_url          = ""
teams_incident_webhook_url = ""
render_video_image_uri     = "123456789012.dkr.ecr.us-east-2.amazonaws.com/render_video_repository:latest"
schedule_expression        = "rate(5 minutes)"
vpc_cidr                   = "10.1.0.0/16"
aws_availability_zones     = ["us-east-1a", "us-east-1b"]