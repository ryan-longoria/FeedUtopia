################################################################################
## Lambda
################################################################################

#############################
# fetch_rss
#############################

resource "aws_lambda_function" "fetch_rss" {
  function_name    = "fetch_rss"
  filename         = "${path.module}/artifacts/scripts/fetch_rss/fetch_rss.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/fetch_rss/fetch_rss.zip")
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.9"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 10
}



#############################
# notify_post
#############################

resource "aws_lambda_function" "notify_post" {
  function_name    = "notify_post"
  filename         = "${path.module}/artifacts/scripts/notify_post/notify_post.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/notify_post/notify_post.zip")
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.9"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 10
  environment {
    variables = {
      TEAMS_WEBHOOK_URL = var.teams_webhooks.animeutopia.auto,
      TARGET_BUCKET     = var.s3_bucket_name
    }
  }
}
