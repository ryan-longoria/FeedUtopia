################################################################################
## Locals
################################################################################

locals {
  project = "${var.project_name}-prod"

  account_map = {
    "animeutopia"   = var.aws_account_ids.animeutopia
    "wrestleutopia" = var.aws_account_ids.wrestleutopia
  }
}