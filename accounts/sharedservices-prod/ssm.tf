################################################################################
## Systems Manager (SSM)
################################################################################

data "aws_ssm_parameter" "openai" {
  name            = "/openai/api_key"
  with_decryption = true
}

data "aws_ssm_parameter" "instagram_verify_token" {
  name            = "/instagram/verifytoken"
  with_decryption = true
}

data "aws_ssm_parameter" "instagram_app_id" {
  name            = "/instagram/client_id"
  with_decryption = true
}

data "aws_ssm_parameter" "instagram_app_secret" {
  name            = "/instagram/client_secret"
  with_decryption = true
}