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
# render_video
#############################

resource "aws_lambda_function" "render_video" {
  function_name = "render_video"
  package_type  = "Image"
  image_uri     = var.render_video_image_uri
  role          = aws_iam_role.lambda_role.arn
  timeout       = 900
  memory_size   = 3008

  environment {
    variables = {
      TARGET_BUCKET = "prod-sharedservices-artifacts-bucket"
      FFMPEG_PATH   = "/opt/bin/ffmpeg"
    }
  }

  vpc_config {
    subnet_ids = [
      aws_subnet.API_public_subnet_1.id,
      aws_subnet.API_public_subnet_2.id
    ]

    security_group_ids = [
      aws_security_group.efs_sg.id
    ]
  }

  file_system_config {
    arn              = aws_efs_access_point.lambda_ap.arn
    local_mount_path = "/mnt/efs"
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
