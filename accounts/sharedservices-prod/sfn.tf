################################################################################
## Step Functions
################################################################################

resource "aws_sfn_state_machine" "manual_workflow" {
  name     = "manual_workflow"
  role_arn = aws_iam_role.step_functions_role.arn
  type     = "EXPRESS"

  definition = templatefile("${path.module}/manual_state_machine.json.tpl", {
    render_video_arn    = aws_lambda_function.render_video.arn,
    notify_post_arn     = aws_lambda_function.notify_post.arn
  })

  logging_configuration {
    level                  = "ALL"
    include_execution_data = true
    log_destination       = "${aws_cloudwatch_log_group.manual_step_function_log_group.arn}:*"
  }
}