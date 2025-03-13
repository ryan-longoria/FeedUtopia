resource "aws_ecs_cluster" "main" {
  name = "backstage-cluster"
}

resource "aws_cloudwatch_log_group" "backstage" {
  name              = "/ecs/backstage"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "backstage" {
  family                   = "backstage-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = aws_iam_role.ecs_task_exec.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "backstage"
      image = "public.ecr.aws/r1z1c0k6/backstage:latest"
      portMappings = [
        {
          containerPort = 7007
          hostPort      = 7007
        }
      ]
      environment = [
        { name = "POSTGRES_HOST", value = aws_db_instance.backstage.address },
        { name = "POSTGRES_USER", value = aws_db_instance.backstage.username },
        { name = "POSTGRES_PASSWORD", value = var.db_password },
        { name = "POSTGRES_DATABASE", value = aws_db_instance.backstage.db_name },
        { name = "TECHDOCS_S3_BUCKET", value = aws_s3_bucket.techdocs.id }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.backstage.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "backstage"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "backstage" {
  name            = "backstage-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backstage.arn
  launch_type     = "FARGATE"
  desired_count   = 1

  network_configuration {
    subnets          = [aws_subnet.private1.id, aws_subnet.private2.id]
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backstage.arn
    container_name   = "backstage"
    container_port   = 7007
  }

  depends_on = [aws_lb_listener.frontend_https]
}
