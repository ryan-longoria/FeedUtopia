################################################################################
## Providers Declared Here - Configured by variables
################################################################################

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = var.common_tags
  }

  assume_role {
    role_arn = "arn:aws:iam::${var.aws_account_ids.project}:role/TerraformExecutionRole"
  }
}
