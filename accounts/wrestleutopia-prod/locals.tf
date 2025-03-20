################################################################################
## Locals
################################################################################

locals {
  project = "${var.project_name}-prod"
  TEAMS_WEBHOOK_URL = var.teams_webhooks[var.project_name].auto
}