################################################################################
## Lambda
################################################################################

#############################
# sns_to_teams
#############################

resource "aws_lambda_function" "sns_to_teams" {
  function_name    = "${var.project_name}-sns-to-teams"
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.9"
  role             = aws_iam_role.lambda_role.arn
  filename         = "${path.module}/artifacts/scripts/sns_to_teams/sns_to_teams.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/sns_to_teams/sns_to_teams.zip")
  timeout          = 10

  environment {
    variables = {
      TEAMS_WEBHOOK_URL = var.incidents_teams_webhook
    }
  }
}

#############################
# api_router
#############################

resource "aws_lambda_function" "api_router" {
  function_name = "api-router"
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.9"
  role          = aws_iam_role.lambda_role.arn
  filename      = "${path.module}/artifacts/scripts/api_router/api_router.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/api_router/api_router.zip")
  environment {
    variables = {
      STEPFUNCTIONS_ARNS_JSON = jsonencode(var.stepfunctions_arns)
    }
  }
}

#############################
# crossaccount_invoker
#############################

resource "aws_lambda_function" "crossaccounts_invoker" {
  function_name = "crossaccount_invoker"
  runtime       = "python3.9"
  role          = aws_iam_role.external_lambda_role.arn
  handler       = "lambda_function.lambda_handler"
  filename         = "${path.module}/artifacts/scripts/crossaccount_invoker/crossaccount_invoker.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/crossaccount_invoker/crossaccount_invoker.zip")

  environment {
    variables = {
      CROSS_ACCT_ROLES = jsonencode(var.cross_account_role_arns)
    }
  }
}