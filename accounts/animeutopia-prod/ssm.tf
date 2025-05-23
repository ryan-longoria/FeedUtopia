################################################################################
## Systems Manager (SSM)
################################################################################

data "aws_ssm_parameter" "ann_news_user" {
  name            = "/animeutopia/prod/ann_news_user"
  with_decryption = true
}

data "aws_ssm_parameter" "ann_news_pass" {
  name            = "/animeutopia/prod/ann_news_pass"
  with_decryption = true
}