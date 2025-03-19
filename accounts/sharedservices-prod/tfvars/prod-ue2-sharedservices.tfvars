################################################################################
## Account Specific Variables
################################################################################

project_name               = "sharedservices"
aws_region                 = "us-east-2"
environment                = "prod"
terraform_backend_bucket   = "prod-sharedservices-backend-bucket"
vpc_cidr                   = "10.1.0.0/16"
aws_availability_zones     = ["us-east-2a", "us-east-2b"]

stepfunctions_arns = {
  animeutopia   = "arn:aws:states:us-east-2:481665084477:stateMachine:anime_workflow"
  wrestleutopia = "arn:aws:states:us-east-2:390402544450:stateMachine:automated_workflow"
}
cross_account_role_arns = [
  "arn:aws:iam::481665084477:role/CrossAccountStartExecutionRole",
  "arn:aws:iam::390402544450:role/CrossAccountStartExecutionRole"
]
