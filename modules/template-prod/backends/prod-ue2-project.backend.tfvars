################################################################################
## Account Specific Backend Declaraction Variables
################################################################################

bucket   = "prod-project-backend-bucket"
key      = "tfstate/project/terraform.tfstate"
region   = "us-east-2"
role_arn = "arn:aws:iam::${var.aws_account_ids.project}:role/TerraformExecutionRole"
