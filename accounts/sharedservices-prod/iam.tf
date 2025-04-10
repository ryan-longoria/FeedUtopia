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
          "arn:aws:s3:::prod-sharedservices-artifacts-bucket/*"
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
        Effect = "Allow",
        Action = [
          "lambda:InvokeFunction"
        ],
        Resource = [
          aws_lambda_function.get_logo.arn,
          aws_lambda_function.render_video.arn,
          aws_lambda_function.delete_logo.arn,
          aws_lambda_function.notify_post.arn
        ]
      },
      {
        Effect = "Allow",
        Action = [
          "logs:CreateLogDelivery",
          "logs:GetLogDelivery",
          "logs:UpdateLogDelivery",
          "logs:DeleteLogDelivery",
          "logs:ListLogDeliveries",
          "logs:PutResourcePolicy",
          "logs:DescribeResourcePolicies",
          "logs:DescribeLogGroups"
        ],
        Resource = "*"
      }
    ]
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
        aws_wafv2_web_acl.api_waf.arn # WAF ACL that will send logs
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
    sid = "AllowanimeutopiaAccountToAssume"
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
    sid     = "Route53Permissions"
    effect  = "Allow"
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