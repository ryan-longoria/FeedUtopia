################################################################################
## Providers Declared Here - Configured by variables
################################################################################

provider "aws" {
  alias  = "project"
  region = var.aws_region

  default_tags {
    tags = {
      DeployedBy = "Terraform"
    }
  }

  assume_role {
    role_arn = "arn:aws:iam::${var.aws_account_ids.project}:role/TerraformExecutionRole"
  }
}
