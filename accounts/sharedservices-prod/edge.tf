################################################################################
## Azure Entra ID module
################################################################################

module "edge_auth" {
  source  = "nickshine/lambda-edge-azure-auth/aws"
  version = "0.4.0"

  client_id     = var.azuread_client_id
  client_secret = var.azuread_client_secret
  tenant        = var.azuread_tenant_id
  redirect_uri  = "https://feedutopia.com/_auth/callback"

  session_duration = 24
  simple_urls_enabled = true
}
