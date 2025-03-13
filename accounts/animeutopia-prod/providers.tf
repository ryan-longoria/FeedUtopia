################################################################################
## Providers Declared Here - Configured by variables
################################################################################

provider "aws" {
  alias = "animeutopia"
  region = var.aws_region

  default_tags {
    tags = {
      DeployedBy = "Terraform"
    }
  }

  assume_role {
    role_arn = "arn:aws:iam::481665084477:role/TerraformExecutionRole"
  }
}
