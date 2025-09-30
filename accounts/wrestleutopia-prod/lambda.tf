################################################################################
## Lambda
################################################################################

resource "aws_lambda_function" "add_to_group" {
  function_name    = "${var.project_name}-postconfirm-add-to-group"
  filename         = "${path.module}/artifacts/scripts/add_to_group/add_to_group.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/add_to_group/add_to_group.zip")
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.12"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 10

  environment {
    variables = {
      DEFAULT_GROUP   = "Wrestlers"
      PROMOTER_NAME   = "Promoters"
      TABLE_WRESTLERS = aws_dynamodb_table.wrestlers.name
      TABLE_PROMOTERS = aws_dynamodb_table.promoters.name
    }
  }
}

resource "aws_lambda_function" "cognito_cleanup" {
  function_name    = "${var.project_name}-cognito-cleanup"
  filename         = "${path.module}/artifacts/scripts/cognito_cleanup/cognito_cleanup.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/cognito_cleanup/cognito_cleanup.zip")
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.12"
  role             = aws_iam_role.lambda_role.arn
  timeout          = 10

  environment {
    variables = {
      USER_POOL_ID  = "us-east-2_9oCzdeOZF"
      MAX_AGE_HOURS = "24"
    }
  }
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.project_name}-api"
  filename         = "${path.module}/artifacts/scripts/api/api.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/api/api.zip")
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.12"
  role             = aws_iam_role.api_lambda_role.arn
  timeout          = 15

  environment {
    variables = {
      TABLE_WRESTLERS = aws_dynamodb_table.wrestlers.name
      TABLE_PROMOTERS = aws_dynamodb_table.promoters.name
      TABLE_TRYOUTS   = aws_dynamodb_table.tryouts.name
      TABLE_APPS      = aws_dynamodb_table.applications.name
      MEDIA_BUCKET    = aws_s3_bucket.media_bucket.bucket
      TABLE_HANDLES   = aws_dynamodb_table.profile_handles.name
    }
  }
}

resource "aws_lambda_function" "presign" {
  function_name    = "${var.project_name}-presign"
  filename         = "${path.module}/artifacts/scripts/presign/presign.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/presign/presign.zip")
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.12"
  role             = aws_iam_role.presign_lambda_role.arn
  timeout          = 10

  environment {
    variables = {
      MEDIA_BUCKET = aws_s3_bucket.media_bucket.bucket
    }
  }
}

resource "aws_lambda_function" "upload_url" {
  function_name    = "${var.project_name}-upload-url"
  filename         = "${path.module}/artifacts/scripts/upload_url/upload_url.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/upload_url/upload_url.zip")
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.12"
  role             = aws_iam_role.presign_lambda_role.arn
  timeout          = 10

  environment {
    variables = {
      MEDIA_BUCKET   = aws_s3_bucket.media_bucket.bucket
      TABLE_NAME     = aws_dynamodb_table.tryouts.name
      ALLOWED_ORIGIN = "https://www.wrestleutopia.com"
    }
  }
}

resource "aws_lambda_function" "image_processor" {
  function_name    = "${var.project_name}-image-processor"
  filename         = "${path.module}/artifacts/scripts/image_processor/image_processor.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/image_processor/image_processor.zip")
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.12"
  role             = aws_iam_role.image_processor_role.arn
  timeout          = 120
  reserved_concurrent_executions = 10
  memory_size      = 1024
  ephemeral_storage { size = 1024 }

  environment {
    variables = {
      TABLE_NAME   = aws_dynamodb_table.tryouts.name
      CDN_BASE     = "https://cdn.wrestleutopia.com"
    }
  }

  layers = [
    "arn:aws:lambda:us-east-2:825765422855:layer:Python_pillow:5"
  ]
}

resource "aws_lambda_function" "pre_signup" {
  function_name    = "${var.project_name}-pre-signup"
  filename         = "${path.module}/artifacts/scripts/pre_signup/pre_signup.zip"
  source_code_hash = filebase64sha256("${path.module}/artifacts/scripts/pre_signup/pre_signup.zip")
  handler          = "lambda_function.lambda_handler"
  runtime          = "python3.12"
  role             = aws_iam_role.pre_signup_role.arn
  timeout          = 10

}