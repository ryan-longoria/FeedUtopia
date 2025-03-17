
resource "aws_sqs_queue" "lambda_dlq" {
  name = "${var.project_name}-lambda-dlq"
}