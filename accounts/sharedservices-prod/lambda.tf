################################################################################
## Lambda
################################################################################

#############################
# start_sfn
#############################

resource "aws_lambda_function" "start_sfn" {
  function_name    = "start_sfn"
  filename         = "${path.module}/artifacts/scripts/start_sfn/start_sfn.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/start_sfn/start_sfn.zip")
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.9"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 10

  environment {
    variables = {
      STATE_MACHINE_ARN = aws_sfn_state_machine.manual_workflow.arn
      TARGET_BUCKET     = "prod-sharedservices-artifacts-bucket"
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}

#############################
# get_logo
#############################

resource "aws_lambda_function" "get_logo" {
  function_name    = "get_logo"
  filename         = "${path.module}/artifacts/scripts/get_logo/get_logo.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/get_logo/get_logo.zip")
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.9"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 10

  environment {
    variables = {
      TARGET_BUCKET               = "prod-sharedservices-artifacts-bucket"
      CROSSACCOUNT_READ_ROLE_NAME = "CrossAccountS3ReadRole"
      ACCOUNT_MAP                 = jsonencode(local.account_map)
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}

#############################
# delete_logo
#############################

resource "aws_lambda_function" "delete_logo" {
  function_name    = "delete_logo"
  filename         = "${path.module}/artifacts/scripts/delete_logo/delete_logo.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/delete_logo/delete_logo.zip")
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.9"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 10

  environment {
    variables = {
      TARGET_BUCKET               = "prod-sharedservices-artifacts-bucket"
      CROSSACCOUNT_READ_ROLE_NAME = "CrossAccountS3ReadRole"
      ACCOUNT_MAP                 = jsonencode(local.account_map)
    }
  }

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
  timeout          = 20

  environment {
    variables = {
      TEAMS_WEBHOOKS_JSON = jsonencode(var.teams_webhooks)
      TARGET_BUCKET       = "prod-sharedservices-artifacts-bucket"
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

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}

#############################
# ig_webhook_handler
#############################

resource "aws_lambda_function" "ig_webhook_handler" {
  function_name    = "${var.project_name}-ig-webhook-handler"
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.9"
  role             = aws_iam_role.lambda_role.arn
  filename         = "${path.module}/artifacts/scripts/ig_webhook_handler/ig_webhook_handler.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/ig_webhook_handler/ig_webhook_handler.zip")

  timeout = 10

  environment {
    variables = {
      VERIFY_TOKEN = var.instagram_verify_token
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}

#############################
# instagram_oauth
#############################

resource "aws_lambda_function" "instagram_oauth" {
  function_name = "${var.project_name}-instagram-oauth"
  handler       = "instagram_oauth.lambda_handler"
  runtime       = "python3.9"
  role          = aws_iam_role.lambda_role.arn

  filename         = "${path.module}/artifacts/scripts/instagram_oauth/instagram_oauth.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/instagram_oauth/instagram_oauth.zip")

  environment {
    variables = {
      INSTAGRAM_APP_ID     = var.instagram_app_id
      INSTAGRAM_APP_SECRET = var.instagram_app_secret
      REDIRECT_URI         = "https://${aws_apigatewayv2_api.instagram_api.api_endpoint}/instagram/auth/callback"
    }
  }
}

#############################
# generate_upload_url
#############################

resource "aws_lambda_function" "generate_upload_url" {
  function_name = "${var.project_name}-generate-upload-url"
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.9"
  role          = aws_iam_role.lambda_role.arn
  timeout       = 10

  filename         = "${path.module}/artifacts/websites/feedutopia/backend/generate_upload_url/generate_upload_url.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/websites/feedutopia/backend/generate_upload_url/generate_upload_url.zip")

  environment {
    variables = {
      UPLOAD_BUCKET = "prod-sharedservices-artifacts-bucket"
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}

#############################
# create_feed_post
#############################

resource "aws_lambda_function" "create_feed_post" {
  function_name = "${var.project_name}-create-feed-post"
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.9"
  role          = aws_iam_role.lambda_role.arn
  timeout       = 15

  filename         = "${path.module}/artifacts/websites/feedutopia/backend/create_feed_post/create_feed_post.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/websites/feedutopia/backend/create_feed_post/create_feed_post.zip")

  environment {
    variables = {
      UPLOAD_BUCKET      = "prod-sharedservices-artifacts-bucket"
      FEEDUTOPIA_API_KEY = aws_api_gateway_api_key.api_key.value
    }
  }

  layers = [
    "arn:aws:lambda:us-east-2:825765422855:layer:Python_Requests:1"
  ]

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}

#############################
# kb_presign
#############################

resource "aws_lambda_function" "kb_presign" {
  function_name = "${var.project_name}-kb-presign"
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.9"
  role          = aws_iam_role.lambda_role.arn
  timeout  = 10

  filename = "${path.module}/artifacts/websites/feedutopia/backend/kb_presign/kb_presign.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/websites/feedutopia/backend/kb_presign/kb_presign.zip")
  
  environment {
    variables = {
      BUCKET = aws_s3_bucket.feedutopia-webapp.bucket
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}

#############################
# kb_list
#############################

resource "aws_lambda_function" "kb_list" {
  function_name = "${var.project_name}-kb-list"
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.9"
  role          = aws_iam_role.lambda_role.arn
  timeout       = 10

  filename      = "${path.module}/artifacts/websites/feedutopia/backend/kb_list/kb_list.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/websites/feedutopia/backend/kb_list/kb_list.zip")
  
  environment {
    variables = {
      BUCKET = aws_s3_bucket.feedutopia-webapp.bucket
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}

#############################
# kb_delete
#############################

resource "aws_lambda_function" "kb_delete" {
  function_name = "${var.project_name}-kb-delete"
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.9"
  role          = aws_iam_role.lambda_role.arn
  timeout       = 10

  filename      = "${path.module}/artifacts/websites/feedutopia/backend/kb_delete/kb_delete.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/websites/feedutopia/backend/kb_delete/kb_delete.zip")
  
  environment {
    variables = {
      BUCKET = aws_s3_bucket.feedutopia-webapp.bucket
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}

#############################
# get_tasks
#############################

resource "aws_lambda_function" "get_tasks" {
  function_name    = "${var.project_name}-get-tasks"
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.9"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 10

  filename         = "${path.module}/artifacts/websites/feedutopia/backend/get_tasks/get_tasks.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/websites/feedutopia/backend/get_tasks/get_tasks.zip")

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.weekly_todo.name
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}

#############################
# add_task
#############################

resource "aws_lambda_function" "add_task" {
  function_name    = "${var.project_name}-add-task"
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.9"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 10

  filename         = "${path.module}/artifacts/websites/feedutopia/backend/add_task/add_task.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/websites/feedutopia/backend/add_task/add_task.zip")

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.weekly_todo.name
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}

#############################
# delete_task
#############################

resource "aws_lambda_function" "delete_task" {
  function_name    = "${var.project_name}-delete-task"
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.9"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 10

  filename         = "${path.module}/artifacts/websites/feedutopia/backend/delete_task/delete_task.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/websites/feedutopia/backend/delete_task/delete_task.zip")

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.weekly_todo.name
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}

#############################
# update_task
#############################

resource "aws_lambda_function" "update_task" {
  function_name    = "${var.project_name}-update-task"
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.9"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 10

  filename         = "${path.module}/artifacts/websites/feedutopia/backend/update_task/update_task.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/websites/feedutopia/backend/update_task/update_task.zip")

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.weekly_todo.name
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}

#############################
# strategy_presign
#############################

resource "aws_lambda_function" "strategy_presign" {
  function_name = "${var.project_name}-strategy-presign"
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.9"
  role          = aws_iam_role.lambda_role.arn
  timeout       = 10

  filename         = "${path.module}/artifacts/websites/feedutopia/backend/strategy_presign/strategy_presign.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/websites/feedutopia/backend/strategy_presign/strategy_presign.zip")

  environment {
    variables = {
      BUCKET = aws_s3_bucket.feedutopia-webapp.bucket
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq.arn
  }

  tracing_config {
    mode = "Active"
  }
}

#############################
# edge_auth
#############################

resource "aws_lambda_function" "edge_auth" {
  provider      = aws.us_east_1
  function_name = "${var.project_name}-edge-auth"
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.9"
  role          = aws_iam_role.edge_lambda.arn
  timeout       = 5

  filename         = "${path.module}/artifacts/websites/feedutopia/backend/edge_auth/edge_auth.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/websites/feedutopia/backend/edge_auth/edge_auth.zip")

  publish = true

  layers = [
    "arn:aws:lambda:us-east-2:825765422855:layer:Python_jwt:1"
  ]
}

