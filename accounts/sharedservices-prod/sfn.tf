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

resource "aws_sfn_state_machine" "weekly_recap" {
  name     = "weekly_news_recap"
  role_arn = aws_iam_role.step_functions_role.arn
  type     = "STANDARD"

  definition = templatefile("${path.module}/weekly_recap_state_machine.json.tpl", {
    ecs_cluster_arn   = aws_ecs_cluster.render_cluster.arn
    recap_task_def_arn = aws_ecs_task_definition.weekly_news_recap.arn
    subnet_ids        = jsonencode([
      aws_subnet.API_public_subnet_1.id,
      aws_subnet.API_public_subnet_2.id
    ])
    sg_ids            = jsonencode([aws_security_group.efs_sg.id])
  })

  logging_configuration {
    include_execution_data = true
    level                  = "ALL"
    log_destination        = "${aws_cloudwatch_log_group.weekly_recap_log_group.arn}:*"
  }
}

resource "aws_scheduler_schedule" "weekly_recap_cron" {
  name                 = "weekly-recap-friday-6pm-cst"
  schedule_expression  = "cron(0 0 ? * SAT *)"
  flexible_time_window { mode = "OFF" }

  target {
    arn      = aws_sfn_state_machine.weekly_recap.arn
    role_arn = aws_iam_role.scheduler_invoke_sfn.arn
    input    = jsonencode({})
  }
}

resource "aws_sfn_state_machine" "manual_carousel_workflow" {
  name     = "manual_carousel_workflow"
  role_arn = aws_iam_role.step_functions_role.arn

  definition = templatefile("${path.module}/manual_carousel_state_machine.json.tpl", {
    get_logo_arn                 = aws_lambda_function.get_logo.arn
    delete_logo_arn              = aws_lambda_function.delete_logo.arn
    notify_post_arn              = aws_lambda_function.notify_post.arn
    ecs_cluster_arn              = aws_ecs_cluster.render_cluster.arn
    render_carousel_task_def_arn = aws_ecs_task_definition.render_carousel.arn
    subnet_ids                   = jsonencode([aws_subnet.API_public_subnet_1.id, aws_subnet.API_public_subnet_2.id])
    sg_ids                       = jsonencode([aws_security_group.efs_sg.id])
  })

  logging_configuration {
  include_execution_data = true
  level                  = "ALL"
  log_destination        = "${aws_cloudwatch_log_group.manual_carousel_step_function_log_group.arn}:*"
}

  tracing_configuration {
    enabled = true
  }

  tags = {
    Project = var.project_name
  }
}