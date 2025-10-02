################################################################################
## Simple Queue Service (SQS) 
################################################################################

resource "aws_sqs_queue" "imgproc_dlq" {
  name = "${var.project_name}-imgproc-dlq"
}

resource "aws_sqs_queue" "image_processor_dlq" {
  name                      = "${var.project_name}-image-processor-dlq"
  message_retention_seconds = 1209600
}