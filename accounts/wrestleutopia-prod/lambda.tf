################################################################################
## Lambda
################################################################################

resource "aws_lambda_function" "add_to_group" {
  function_name = "${var.project_name}-postconfirm-add-to-group"
  filename         = "${path.module}/artifacts/scripts/add_to_group/add_to_group.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/add_to_group/add_to_group.zip")
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.12"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 10

  environment {
    variables = {
      DEFAULT_GROUP = "Wrestlers"
      PROMOTER_NAME = "Promoters"
    }
  }
}

resource "aws_lambda_function" "cognito_cleanup" {
  function_name = "${var.project_name}-cognito-cleanup"
  filename         = "${path.module}/artifacts/scripts/cognito_cleanup/cognito_cleanup.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/cognito_cleanup/cognito_cleanup.zip")
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.12"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 10

  environment {
    variables = {
      USER_POOL_ID   = "us-east-2_9oCzdeOZF"
      MAX_AGE_HOURS  = "24"
    }
  }
}