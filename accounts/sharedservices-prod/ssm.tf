################################################################################
## Systems Manager (SSM)
################################################################################

data "aws_ssm_parameter" "openai" {
  name            = "/prod/openai/api_key"
  with_decryption = true
}