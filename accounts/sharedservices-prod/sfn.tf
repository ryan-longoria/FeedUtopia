################################################################################
## Step Functions
################################################################################

resource "aws_sfn_state_machine" "manual_workflow" {
  name     = "manual_workflow"
  role_arn = aws_iam_role.step_functions_role.arn
  type     = "STANDARD"

  definition = templatefile("${path.module}/manual_state_machine.json.tpl", {
    get_logo_arn    = aws_lambda_function.get_logo.arn
    delete_logo_arn = aws_lambda_function.delete_logo.arn
    notify_post_arn = aws_lambda_function.notify_post.arn

    ecs_cluster_arn     = aws_ecs_cluster.render_cluster.arn
    render_task_def_arn = aws_ecs_task_definition.render_video.arn
    subnet_ids = jsonencode([
      aws_subnet.API_public_subnet_1.id,
      aws_subnet.API_public_subnet_2.id
    ])
    sg_ids = jsonencode([aws_security_group.efs_sg.id])
  })

  logging_configuration {
    level                  = "ALL"
    include_execution_data = true
    log_destination        = "${aws_cloudwatch_log_group.manual_step_function_log_group.arn}:*"
  }
}