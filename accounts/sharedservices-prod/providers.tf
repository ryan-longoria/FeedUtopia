################################################################################
## Providers Declared Here - Configured by variables
################################################################################

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = var.common_tags
  }

  assume_role {
    role_arn = "arn:aws:iam::${var.aws_account_ids.sharedservices}:role/TerraformExecutionRole"
  }
}

provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}