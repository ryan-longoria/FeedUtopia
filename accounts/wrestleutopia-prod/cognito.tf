################################################################################
## Cognito
################################################################################

resource "aws_cognito_user_pool" "this" {
  name = local.user_pool_name
  mfa_configuration = "ON"
  auto_verified_attributes = ["email"]

  schema {
    attribute_data_type = "String"
    name                = "role"
    developer_only_attribute = false
    mutable            = true
    required           = false
    string_attribute_constraints {
      min_length = 3
      max_length = 32
    }
  }

  account_recovery_setting {
    recovery_mechanism { 
        name = "verified_email" 
        priority = 1 
    }
  }

  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  lambda_config {
    post_confirmation = aws_lambda_function.add_to_group.arn
  }
}

resource "aws_cognito_user_group" "wrestlers" {
  name         = "Wrestlers"
  user_pool_id = aws_cognito_user_pool.this.id
  precedence   = 10
}

resource "aws_cognito_user_group" "promoters" {
  name         = "Promoters"
  user_pool_id = aws_cognito_user_pool.this.id
  precedence   = 20
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.project_name}-web-client"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true
  refresh_token_validity        = 30
  access_token_validity         = 60
  id_token_validity             = 60
  token_validity_units {
    access_token = "minutes"
    id_token     = "minutes"
    refresh_token = "days"
  }

  read_attributes  = ["email", "email_verified", "custom:role", "given_name", "family_name"]
  write_attributes = ["email", "custom:role", "given_name", "family_name"]

  supported_identity_providers = ["COGNITO"]

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls
}

resource "aws_cognito_user_pool_domain" "this" {
  count       = var.enable_hosted_ui ? 1 : 0
  domain      = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}