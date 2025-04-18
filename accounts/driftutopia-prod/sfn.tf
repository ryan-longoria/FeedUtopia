################################################################################
## Step Functions
################################################################################

resource "aws_sfn_state_machine" "automated_workflow" {
  name     = "automated_${var.project_name}_workflow"
  role_arn = aws_iam_role.step_functions_role.arn
  type     = "EXPRESS"

  definition = templatefile("${path.module}/state_machine.json.tpl", {
    fetch_data_arn      = aws_lambda_function.fetch_data.arn,
    check_duplicate_arn = aws_lambda_function.check_duplicate.arn,
    notify_post_arn     = aws_lambda_function.notify_post.arn
  })

  logging_configuration {
    level                  = "ALL"
    include_execution_data = true
    log_destination        = "${aws_cloudwatch_log_group.automated_step_function_log_group.arn}:*"
  }

  tracing_configuration {
    enabled = true
  }
}
