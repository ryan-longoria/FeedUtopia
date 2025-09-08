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
      DEFAULT_GROUP = aws_cognito_user_group.wrestlers.name
      PROMOTER_NAME = aws_cognito_user_group.promoters.name
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}