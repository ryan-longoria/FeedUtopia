################################################################################
## Cloudwatch
################################################################################

resource "aws_cloudwatch_event_rule" "cognito_cleanup_rule" {
  name                = "${var.project_name}-cognito-cleanup-hourly"
  schedule_expression = "rate(1 hour)"
}

resource "aws_cloudwatch_event_target" "cognito_cleanup_target" {
  rule      = aws_cloudwatch_event_rule.cognito_cleanup_rule.name
  target_id = "lambda"
  arn       = aws_lambda_function.cognito_cleanup.arn
}

resource "aws_cloudwatch_log_group" "api_access" {
  name              = "/apigw/${var.project_name}/access"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "lambda_imgproc" {
  name              = "/aws/lambda/${aws_lambda_function.image_processor.function_name}"
  retention_in_days = 30
}

resource "aws_cloudwatch_event_rule" "s3_raw_puts" {
  name        = "wutopia-s3-raw-puts"
  description = "S3 Object Created events for ${aws_s3_bucket.media_bucket.bucket} with key prefix raw/uploads/"
  event_pattern = jsonencode({
    "source" : ["aws.s3"],
    "detail-type" : ["Object Created"],
    "detail" : {
      "bucket" : { "name" : [aws_s3_bucket.media_bucket.bucket] },
      "object" : { "key" : [{ "prefix" : "raw/uploads/" }] }
    }
  })
}

resource "aws_cloudwatch_event_target" "imgproc" {
  rule      = aws_cloudwatch_event_rule.s3_raw_puts.name
  target_id = "lambda-imgproc"
  arn       = aws_lambda_function.image_processor.arn

  dead_letter_config {
    arn = aws_sqs_queue.imgproc_dlq.arn
  }

  retry_policy {
    maximum_retry_attempts       = 5
    maximum_event_age_in_seconds = 3600
  }
}