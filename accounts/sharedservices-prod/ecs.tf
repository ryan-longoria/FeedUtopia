resource "aws_ecs_cluster" "render_cluster" {
  name = "${var.project_name}-render-cluster"
}

resource "aws_ecs_task_definition" "render_video" {
  family                   = "render_video"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 2048
  memory                   = 4096
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name    = "render_video",
      image   = var.render_video_image_uri,
      command = ["python", "lambda_function.py"],
      environment = [
        { name = "TARGET_BUCKET", value = "prod-sharedservices-artifacts-bucket" },
        { name = "FFMPEG_PATH", value = "/opt/bin/ffmpeg" },
        { name = "EVENT_JSON", value = "" }
      ],
      mountPoints = [{
        sourceVolume  = "efs",
        containerPath = "/mnt/efs",
        readOnly      = false
      }],
      logConfiguration = {
        logDriver = "awslogs",
        options = {
          awslogs-group         = "/ecs/render_video",
          awslogs-region        = var.aws_region,
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  volume {
    name = "efs"
    efs_volume_configuration {
      file_system_id = aws_efs_file_system.lambda_efs.id
      authorization_config {
        access_point_id = aws_efs_access_point.lambda_ap.id
        iam             = "ENABLED"
      }
      transit_encryption = "ENABLED"
    }
  }
}

resource "aws_ecs_task_definition" "weekly_news_recap" {
  family                   = "weekly_news_recap"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.weekly_recap_cpu
  memory                   = var.weekly_recap_memory

  execution_role_arn = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn      = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name  = "weekly_recap"
      image = var.weekly_recap_image_uri

      command = ["python", "lambda_function.py"]

      environment = [
        { name = "TARGET_BUCKET",        value = "prod-sharedservices-artifacts-bucket" },
        { name = "NEWS_TABLE",           value = aws_dynamodb_table.weekly_news_posts.name },
        { name = "NOTIFY_POST_FUNCTION_ARN", value = aws_lambda_function.notify_post.arn }
      ]

      mountPoints = [{
        sourceVolume  = "efs"
        containerPath = "/mnt/efs"
        readOnly      = false
      }]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/weekly_recap"
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  volume {
    name = "efs"
    efs_volume_configuration {
      file_system_id          = aws_efs_file_system.lambda_efs.id
      authorization_config {
        access_point_id = aws_efs_access_point.lambda_ap.id
        iam             = "ENABLED"
      }
      transit_encryption = "ENABLED"
    }
  }
}

resource "aws_ecs_task_definition" "render_carousel" {
  family                   = "render_carousel"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 2048
  memory                   = 4096
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn
  task_role_arn            = aws_iam_role.ecs_task_role.arn

  container_definitions = jsonencode([
    {
      name    = "render_carousel"
      # your entrypoint should read EVENT_JSON & TASK_TOKEN from env and kick off moviepy,
      command = ["python", "lambda_function.py"]

      environment = [
        { name = "EVENT_JSON",   value = "" },
        { name = "TASK_TOKEN",   value = "" },
        { name = "FFMPEG_PATH",  value = "/opt/bin/ffmpeg" },
        { name = "TARGET_BUCKET",value = "prod-sharedservices-artifacts-bucket" },
      ]

      mountPoints = [
        {
          sourceVolume  = "efs"
          containerPath = "/mnt/efs"
          readOnly      = false
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = "/ecs/render_carousel"
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  volume {
    name = "efs"
    efs_volume_configuration {
      file_system_id = aws_efs_file_system.lambda_efs.id
      authorization_config {
        access_point_id = aws_efs_access_point.lambda_ap.id
        iam             = "ENABLED"
      }
      transit_encryption = "ENABLED"
    }
  }
}