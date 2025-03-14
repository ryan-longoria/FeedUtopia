resource "aws_ecs_cluster" "main" {
  name = "backstage-cluster"
}

resource "aws_cloudwatch_log_group" "backstage" {
  name              = "/ecs/backstage"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "backstage" {
  family                   = "${var.app_name}-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "512"            
  memory                   = "1024"           
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.backstage_task.arn
  container_definitions    = jsonencode([
    {
      name  = "backstage"
      image = "${aws_ecr_repository.backstage.repository_url}:latest"  
      portMappings = [{ containerPort = 7000, hostPort = 7000 }]
      environment = [
        { name: "NODE_ENV", value: "production" },
        { name: "PGHOST", value: aws_db_instance.backstage.address },
        { name: "PGUSER", value: var.db_username },
        { name: "PGPASSWORD", value: var.db_password },
        { name: "PGDATABASE", value: var.db_name },
        { name: "APP_CONFIG_app_baseUrl", value: "https://${var.backstage_domain}" },
        { name: "APP_CONFIG_backend_baseUrl", value: "https://${var.backstage_domain}" }
      ]
      environment = concat(environment, [
        { name: "AWS_REGION", value: var.aws_region }
      ])
      logConfiguration = {
        logDriver: "awslogs",
        options: {
          awslogs-group: "/ecs/${var.app_name}",
          awslogs-region: var.aws_region,
          awslogs-stream-prefix: "ecs"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "backstage" {
  name            = "${var.app_name}-service"
  cluster         = aws_ecs_cluster.backstage.id
  task_definition = aws_ecs_task_definition.backstage.arn
  launch_type     = "FARGATE"
  desired_count   = 1
  platform_version = "LATEST"
  network_configuration {
    subnets          = [for subnet in aws_subnet.private : subnet.id]
    security_groups  = [aws_security_group.ecs_sg.id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.backstage.arn
    container_name   = "backstage"
    container_port   = 7000
  }
  depends_on = [aws_lb_listener_rule.cognito_auth]
}