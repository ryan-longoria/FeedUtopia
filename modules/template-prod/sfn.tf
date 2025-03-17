################################################################################
## Step Functions
################################################################################

resource "aws_sfn_state_machine" "automated_workflow" {
  name     = "automated_${var.project_name}_workflow"
  role_arn = aws_iam_role.step_functions_role.arn

  definition = templatefile("${path.module}/state_machine.json.tpl", {
    fetch_rss_arn       = aws_lambda_function.fetch_data.arn,
    process_content_arn = aws_lambda_function.process_content.arn,
    store_data_arn      = aws_lambda_function.store_data.arn,
    render_video_arn    = aws_lambda_function.render_video.arn,
    notify_post_arn     = aws_lambda_function.notify_post.arn
  })
}
