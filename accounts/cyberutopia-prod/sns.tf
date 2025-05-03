################################################################################
## Simple Notification Service (SNS)
################################################################################

resource "aws_sns_topic" "monitoring_topic" {
  name = "${var.project_name}-monitoring-topic"
}

resource "aws_sns_topic_subscription" "sns_lambda_subscription" {
  topic_arn = aws_sns_topic.monitoring_topic.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.sns_to_teams.arn
}
