################################################################################
## Identity and Access Management (IAM)
################################################################################

#############################
# IAM Policy for API Gateway
#############################

data "aws_iam_policy_document" "apigw_logs_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["apigateway.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "apigw_logs_role" {
  name               = "APIGatewayLogsRole"
  assume_role_policy = data.aws_iam_policy_document.apigw_logs_trust.json
}

resource "aws_iam_role_policy_attachment" "apigw_logs_role_attachment" {
  role       = aws_iam_role.apigw_logs_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

resource "aws_api_gateway_account" "apigw_account" {
  cloudwatch_role_arn = aws_iam_role.apigw_logs_role.arn
}

#############################
# IAM Policy for Lambda
#############################

resource "aws_iam_role" "lambda_role" {
  name = "${var.project_name}_lambda_role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action    = "sts:AssumeRole",
      Effect    = "Allow",
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_ssm_full" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMFullAccess"
}

resource "aws_iam_role_policy_attachment" "lambda_vpc_access" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_xray_write_access" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy_attachment" "lambda_s3_full_access" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.s3_full_policy.arn
}

resource "aws_lambda_permission" "allow_sns_invoke" {
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sns_to_teams.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.monitoring_topic.arn
}

resource "aws_iam_role_policy_attachment" "lambda_insights_policy" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchLambdaInsightsExecutionRolePolicy"
}

resource "aws_lambda_permission" "allow_apigw_invoke_start_sfn" {
  statement_id  = "AllowAPIGatewayInvokeStartSFN"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.start_sfn.function_name

  principal  = "apigateway.amazonaws.com"
  source_arn = "arn:aws:execute-api:us-east-2:825765422855:${aws_api_gateway_rest_api.api.id}/*/POST/start-execution"
}

resource "aws_iam_role_policy" "lambda_sfn_execution" {
  name = "AllowStatesStartExecution"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "states:StartExecution"
        ],
        Resource = [
          aws_sfn_state_machine.manual_workflow.arn
        ]
      }
    ]
  })
}

resource "aws_lambda_permission" "allow_apigw_upload" {
  statement_id  = "AllowAPIGWInvokeUpload"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.generate_upload_url.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "allow_apigw_submit" {
  statement_id  = "AllowAPIGWInvokeSubmit"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.create_feed_post.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "allow_apigw_oauth" {
  statement_id  = "AllowHttpApiInvokeOAuth"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.instagram_oauth.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.instagram_api.execution_arn}/*/GET/instagram/auth/callback"
}

resource "aws_lambda_permission" "allow_apigw_invoke_gpt_ig_caption" {
  statement_id  = "AllowAPIGwInvokeGPTCaption"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.gpt_ig_caption.function_name

  principal = "apigateway.amazonaws.com"
  source_arn = "${aws_api_gateway_rest_api.api.execution_arn}/*/POST/gpt/ig-caption"
}

resource "aws_iam_role_policy" "lambda_assume_each_account" {
  for_each = var.aws_account_ids

  name = "AllowAssumeCrossAccountS3ReadRole-${each.key}"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "sts:AssumeRole"
        ]
        Resource = "arn:aws:iam::${each.value}:role/CrossAccountS3ReadRole"
      }
    ]
  })
}

resource "aws_lambda_permission" "allow_apigw" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ig_webhook_handler.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "arn:aws:execute-api:${var.aws_region}:${data.aws_caller_identity.current.account_id}:${aws_apigatewayv2_api.instagram_api.id}/*/*/instagram/webhook"
}

resource "aws_lambda_permission" "allow_apigw_invoke_kb_list" {
  statement_id  = "AllowAPIGatewayInvokeKBList"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.kb_list.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${aws_api_gateway_rest_api.api.execution_arn}/*/GET/kb"
}

resource "aws_lambda_permission" "allow_apigw_invoke_kb_presign" {
  statement_id  = "AllowAPIGatewayInvokeKBPresign"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.kb_presign.function_name
  principal     = "apigateway.amazonaws.com"

  source_arn = "${aws_api_gateway_rest_api.api.execution_arn}/*/POST/kb/upload-url"
}

resource "aws_lambda_permission" "allow_apigw_invoke_kb_delete" {
  statement_id  = "AllowAPIGatewayInvokeKBDelete"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.kb_delete.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/DELETE/kb"
}

resource "aws_lambda_permission" "allow_apigw_invoke_get_tasks" {
  statement_id  = "AllowAPIGatewayInvokeGetTasks"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_tasks.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/GET/tasks"
}

resource "aws_lambda_permission" "allow_apigw_invoke_add_task" {
  statement_id  = "AllowAPIGatewayInvokeAddTask"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.add_task.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/POST/tasks"
}

resource "aws_lambda_permission" "allow_apigw_invoke_delete_task" {
  statement_id  = "AllowAPIGatewayInvokeDeleteTask"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.delete_task.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/DELETE/tasks/*"
}

resource "aws_lambda_permission" "allow_apigw_invoke_update_task" {
  statement_id  = "AllowAPIGatewayInvokeUpdateTask"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.update_task.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/PATCH/tasks/*"
}

resource "aws_lambda_permission" "allow_apigw_invoke_strategy_presign" {
  statement_id  = "AllowAPIGatewayInvokeStrategyPresign"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.strategy_presign.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/POST/strategy/upload-url"
}

resource "aws_lambda_permission" "apigw_invoke_gpt_image_gen" {
  statement_id  = "AllowExecutionFromAPIGatewayImageGen"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.gpt_image_gen.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn = "${aws_api_gateway_rest_api.api.execution_arn}/*/*/gpt/image-gen"
}

data "aws_iam_policy_document" "ddb_put" {
  statement {
    actions   = ["dynamodb:PutItem"]
    resources = [aws_dynamodb_table.weekly_news_posts.arn]
    effect    = "Allow"
  }
}

resource "aws_iam_role_policy" "lambda_news_put" {
  role   = aws_iam_role.lambda_role.id
  policy = data.aws_iam_policy_document.ddb_put.json
}

resource "aws_lambda_permission" "recap_events" {
  statement_id  = "AllowEventInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.weekly_news_recap.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.weekly_recap_rule.arn
}

data "aws_iam_policy_document" "recap_perms" {
  statement {
    actions   = ["dynamodb:Query", "dynamodb:Scan", "dynamodb:DeleteItem"]
    resources = [aws_dynamodb_table.weekly_news_posts.arn]
    effect    = "Allow"
  }
  statement {
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = [
      "arn:aws:s3:::prod-sharedservices-artifacts-bucket",
      "arn:aws:s3:::prod-sharedservices-artifacts-bucket/*"
    ]
    effect = "Allow"
  }
}

resource "aws_iam_role_policy" "recap_lambda_policy" {
  role   = aws_iam_role.lambda_role.id
  policy = jsonencode({
    Version : "2012-10-17",
    Statement : [{
      Effect   : "Allow",
      Action   : "lambda:InvokeFunction",
      Resource : aws_lambda_function.notify_post.arn
    }]
  })
}

resource "aws_iam_role_policy" "recap_ddb_access" {
  name = "RecapDdbAccess"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = [
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:DeleteItem"
        ],
        Resource = [
          aws_dynamodb_table.weekly_news_posts.arn,
          "${aws_dynamodb_table.weekly_news_posts.arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy" "recap_ddb_scan" {
  name = "RecapDdbScan"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version : "2012-10-17",
    Statement : [{
      Effect   : "Allow",
      Action   : ["dynamodb:Scan"],
      Resource : aws_dynamodb_table.weekly_news_posts.arn
    }]
  })
}

resource "aws_iam_role_policy" "recap_invoke_notify" {
  name = "RecapInvokeNotifyPost"
  role = aws_iam_role.lambda_role.id
  policy = jsonencode({
    Version : "2012-10-17",
    Statement : [{
      Effect   : "Allow",
      Action   : "lambda:InvokeFunction",
      Resource : aws_lambda_function.notify_post.arn
    }]
  })
}

#############################
# IAM Policy for S3
#############################

resource "aws_iam_policy" "s3_full_policy" {
  name        = "${var.project_name}_s3_full_policy"
  description = "Policy to allow Lambda full access to S3"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = "s3:*",
        Resource = [
          "arn:aws:s3:::${var.s3_bucket_name}",
          "arn:aws:s3:::${var.s3_bucket_name}/*",
          "arn:aws:s3:::prod-sharedservices-artifacts-bucket",
          "arn:aws:s3:::prod-sharedservices-artifacts-bucket/*",
          "${aws_s3_bucket.feedutopia-webapp.arn}",
          "${aws_s3_bucket.feedutopia-webapp.arn}/*"
        ]
      }
    ]
  })
}

#############################
# IAM Policy for Step Functions
#############################

resource "aws_iam_role" "step_functions_role" {
  name = "${var.project_name}_step_functions_role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action    = "sts:AssumeRole",
      Effect    = "Allow",
      Principal = { Service = "states.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "step_functions_policy" {
  name = "${var.project_name}_step_functions_policy"
  role = aws_iam_role.step_functions_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        "Effect" : "Allow",
        "Action" : [
          "lambda:InvokeFunction"
        ],
        "Resource" : [
          aws_lambda_function.get_logo.arn,
          aws_lambda_function.delete_logo.arn,
          aws_lambda_function.notify_post.arn
        ]
      },
      {
        "Effect" : "Allow",
        "Action" : [
          "logs:CreateLogDelivery", "logs:GetLogDelivery", "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery", "logs:ListLogDeliveries", "logs:PutResourcePolicy",
          "logs:DescribeResourcePolicies", "logs:DescribeLogGroups"
        ],
        "Resource" : "*"
      },

      {
        "Effect" : "Allow",
        "Action" : [
          "events:PutRule",
          "events:PutTargets",
          "events:DescribeRule",
          "events:RemoveTargets",
          "events:DeleteRule"
        ],
        "Resource" : "arn:aws:events:*:*:rule/StepFunctionsGetEventsForECSTaskRule*"
      },

      {
        "Effect" : "Allow",
        "Action" : ["ecs:RunTask", "ecs:StopTask", "ecs:DescribeTasks"],
        "Resource" : aws_ecs_task_definition.render_video.arn
      },
      {
        "Effect" : "Allow",
        "Action" : "iam:PassRole",
        "Resource" : [
          aws_iam_role.ecs_task_execution_role.arn,
          aws_iam_role.ecs_task_role.arn
        ],
        "Condition" : { "StringEquals" : { "iam:PassedToService" : "ecs-tasks.amazonaws.com" } }
      }
    ]
  })
}

resource "aws_iam_role_policy" "step_functions_ecs" {
  role = aws_iam_role.step_functions_role.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = ["ecs:RunTask", "ecs:StopTask", "ecs:DescribeTasks"],
        Resource = aws_ecs_task_definition.render_video.arn
      },
      {
        Effect = "Allow",
        Action = "iam:PassRole",
        Resource = [
          aws_iam_role.ecs_task_execution_role.arn,
          aws_iam_role.ecs_task_role.arn
        ],
        Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } }
      }
    ]
  })
}

resource "aws_iam_role_policy" "step_functions_policy" {
  name = "${var.project_name}_step_functions_policy"
  role = aws_iam_role.step_functions_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = ["lambda:InvokeFunction"],
        Resource = [
          aws_lambda_function.get_logo.arn,
          aws_lambda_function.delete_logo.arn,
          aws_lambda_function.notify_post.arn
        ]
      },
      {
        Effect   = "Allow",
        Action   = ["ecs:RunTask", "ecs:StopTask", "ecs:DescribeTasks"],
        Resource = [
          aws_ecs_task_definition.render_video.arn,
          aws_ecs_task_definition.weekly_news_recap.arn
        ]
      },
      {
        Effect = "Allow",
        Action = "iam:PassRole",
        Resource = [
          aws_iam_role.ecs_task_execution_role.arn,
          aws_iam_role.ecs_task_role.arn
        ],
        Condition = { "StringEquals": { "iam:PassedToService": "ecs-tasks.amazonaws.com" } }
      }
    ]
  })
}

resource "aws_iam_role_policy" "recap_task_permissions" {
  name = "WeeklyRecapTaskPolicy"
  role = aws_iam_role.ecs_task_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = [
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:GetItem"
        ],
        Resource = [
          aws_dynamodb_table.weekly_news_posts.arn,
          "${aws_dynamodb_table.weekly_news_posts.arn}/*"
        ]
      },
      {
        Effect   = "Allow",
        Action   = "lambda:InvokeFunction",
        Resource = aws_lambda_function.notify_post.arn
      }
    ]
  })
}

resource "aws_iam_role" "scheduler_invoke_sfn" {
  name = "scheduler_start_weekly_recap"
  assume_role_policy = jsonencode({
    Version : "2012-10-17",
    Statement : [{
      Effect = "Allow",
      Action = "sts:AssumeRole",
      Principal = { Service = "scheduler.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "scheduler_start_exec" {
  name = "SchedulerStartSFN"
  role = aws_iam_role.scheduler_invoke_sfn.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = "states:StartExecution",
      Resource = aws_sfn_state_machine.weekly_recap.arn
    }]
  })
}

#############################
# IAM Policy for SQS
#############################

data "aws_iam_policy_document" "dlq_policy_document" {
  statement {
    sid       = "AllowLambdaServiceToSendMessage"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.lambda_dlq.arn]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "lambda_sqs_send_message" {
  name = "${var.project_name}_lambda_sqs_send_message"
  role = aws_iam_role.lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "sqs:SendMessage",
          "sqs:GetQueueAttributes"
        ],
        Resource = [
          aws_sqs_queue.lambda_dlq.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_sqs_send_message" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

resource "aws_sqs_queue_policy" "lambda_dlq_policy" {
  queue_url = aws_sqs_queue.lambda_dlq.id
  policy    = data.aws_iam_policy_document.dlq_policy_document.json
}

#############################
# IAM Policy for VPC Flow Logs
#############################

resource "aws_iam_role" "api_vpc_flow_logs_role" {
  name = "vpc-flow-logs-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          Service = "vpc-flow-logs.amazonaws.com"
        },
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy" "api_vpc_flow_logs_role_policy" {
  name = "vpc-flow-logs-role-policy"
  role = aws_iam_role.api_vpc_flow_logs_role.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ],
        Resource = "*"
      }
    ]
  })
}

#############################
# IAM for WAF Cloudwatch Logging
#############################

data "aws_caller_identity" "current" {}

data "aws_region" "current" {}

data "aws_iam_policy_document" "waf_logs_policy_doc" {
  version = "2012-10-17"

  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["delivery.logs.amazonaws.com"]
    }
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]

    resources = [
      "${aws_cloudwatch_log_group.waf_logs.arn}:*"
    ]

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values = [
        aws_wafv2_web_acl.api_waf.arn
      ]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values = [
        data.aws_caller_identity.current.account_id
      ]
    }
  }
}

resource "aws_cloudwatch_log_resource_policy" "waf_logs_resource_policy" {
  policy_name     = "waf-logs-apigw-policy"
  policy_document = data.aws_iam_policy_document.waf_logs_policy_doc.json
}

#############################
# IAM for Microsoft Copilot Studio Put/Get
#############################

resource "aws_iam_user" "ms-copilot" {
  name = "ms-copilot"
}

resource "aws_iam_user_policy_attachment" "ms-copilot_attach_policy" {
  user       = aws_iam_user.ms-copilot.name
  policy_arn = aws_iam_policy.s3_full_policy.arn
}

#############################
# IAM for AnimeUtopia ecommerce store
#############################

data "aws_iam_policy_document" "dns_role_trust" {
  statement {
    sid    = "AllowanimeutopiaAccountToAssume"
    effect = "Allow"

    principals {
      type = "AWS"
      identifiers = [
        "arn:aws:iam::${var.aws_account_ids.sharedservices}:root"
      ]
    }

    actions = [
      "sts:AssumeRole"
    ]
  }
}

resource "aws_iam_role" "dns_terraform_role" {
  name               = "animeutopia_DNSRole"
  assume_role_policy = data.aws_iam_policy_document.dns_role_trust.json
}

data "aws_iam_policy_document" "dns_role_policy_doc" {
  statement {
    sid    = "Route53Permissions"
    effect = "Allow"
    actions = [
      "route53:*",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "dns_terraform_policy" {
  name   = "DNSTerraformPolicy"
  role   = aws_iam_role.dns_terraform_role.id
  policy = data.aws_iam_policy_document.dns_role_policy_doc.json
}

#############################
# IAM for ECS
#############################

resource "aws_iam_role" "ecs_task_execution_role" {
  name               = "${var.project_name}_ecs_exec_role"
  assume_role_policy = data.aws_iam_policy_document.ecs_exec_trust.json
}

data "aws_iam_policy_document" "ecs_exec_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy_attachment" "ecs_exec_managed" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task_role" {
  name               = "${var.project_name}_ecs_task_role"
  assume_role_policy = data.aws_iam_policy_document.ecs_exec_trust.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_s3" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.s3_full_policy.arn
}

resource "aws_iam_role_policy" "ecs_send_task_success" {
  name = "ecs_send_task_success"
  role = aws_iam_role.ecs_task_role.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Action = [
        "states:SendTaskSuccess",
        "states:SendTaskFailure"
      ],
      Resource = "*"
    }]
  })
}

#############################
# IAM for DynamoDB
#############################

data "aws_iam_policy_document" "todo_table_access" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:GetItem",
      "dynamodb:Scan",
      "dynamodb:DeleteItem",
      "dynamodb:UpdateItem"
    ]
    resources = [
      aws_dynamodb_table.weekly_todo.arn,
      "${aws_dynamodb_table.weekly_todo.arn}/*"
    ]
  }
}

resource "aws_iam_role_policy" "lambda_todo_policy" {
  name   = "LambdaWeeklyTodoPolicy"
  role   = aws_iam_role.lambda_role.id
  policy = data.aws_iam_policy_document.todo_table_access.json
}

#############################
# IAM Policy for Edge Auth
#############################

resource "aws_iam_role" "edge_lambda" {
  name = "${var.project_name}_edge_lambda_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Principal = {
          Service = [
            "lambda.amazonaws.com",
            "edgelambda.amazonaws.com"
          ]
        },
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "edge_lambda_basic" {
  role       = aws_iam_role.edge_lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "edge_ssm" {
  name = "edgeLambdaSSMRead"
  role = aws_iam_role.edge_lambda.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = ["ssm:GetParameter"],
      Resource = "arn:aws:ssm:us-east-2:${data.aws_caller_identity.current.account_id}:parameter/entra/*"
    }]
  })
}