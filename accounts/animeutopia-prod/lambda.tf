################################################################################
## Lambda
################################################################################

#############################
# fetch_data
#############################

resource "aws_lambda_function" "fetch_data" {
  function_name    = "fetch_data"
  filename         = "${path.module}/artifacts/scripts/fetch_data/fetch_data.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/fetch_data/fetch_data.zip")
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.9"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 40

  environment {
    variables = {
      TEAMS_WEBHOOK_URL = local.TEAMS_WEBHOOK_URL,
      ANN_NEWS_USER = data.aws_ssm_parameter.ann_news_user.value
      ANN_NEWS_PASS = data.aws_ssm_parameter.ann_news_pass.value
    }
  }

  layers = [
    "arn:aws:lambda:us-east-2:580247275435:layer:LambdaInsightsExtension:14",
    "arn:aws:lambda:us-east-2:825765422855:layer:Python_FeedParser:1"
  ]

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}

#############################
# check_duplicate
#############################

resource "aws_lambda_function" "check_duplicate" {
  function_name    = "check_duplicate"
  filename         = "${path.module}/artifacts/scripts/check_duplicate/check_duplicate.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/check_duplicate/check_duplicate.zip")
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.9"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 5

  environment {
    variables = {
      IDEMPOTENCY_BUCKET = var.s3_bucket_name
    }
  }

  layers = [
    "arn:aws:lambda:us-east-2:580247275435:layer:LambdaInsightsExtension:14"
  ]

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
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
  timeout          = 5

  environment {
    variables = {
      TEAMS_WEBHOOK_URL = local.TEAMS_WEBHOOK_URL,
      TARGET_BUCKET     = var.s3_bucket_name
    }
  }

  layers = [
    "arn:aws:lambda:us-east-2:825765422855:layer:Python_Requests:1",
    "arn:aws:lambda:us-east-2:580247275435:layer:LambdaInsightsExtension:14"
  ]

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}

#############################
# sns_to_teams
#############################

resource "aws_lambda_function" "sns_to_teams" {
  function_name    = "sns_to_teams"
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.9"
  role             = aws_iam_role.lambda_role.arn
  filename         = "${path.module}/artifacts/scripts/sns_to_teams/sns_to_teams.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/sns_to_teams/sns_to_teams.zip")
  timeout          = 5

  environment {
    variables = {
      TEAMS_WEBHOOK_URL = var.incidents_teams_webhook
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}
