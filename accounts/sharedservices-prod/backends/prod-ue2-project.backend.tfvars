################################################################################
## Account Specific Backend Declaraction Variables
################################################################################

bucket   = "prod-sharedservices-backend-bucket"
key      = "tfstate/sharedservices/terraform.tfstate"
region   = "us-east-2"
role_arn = "arn:aws:iam::${var.aws_account_ids.sharedservices}:role/TerraformExecutionRole"
