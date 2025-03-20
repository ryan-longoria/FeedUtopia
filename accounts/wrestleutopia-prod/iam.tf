################################################################################
## Identity and Access Management (IAM)
################################################################################

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

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_vpc_access" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_xray_write_access" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy_attachment" "lambda_s3_full_access" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.s3_full_policy.arn
}

resource "aws_security_group" "lambda_sg" {
  name        = "${var.project_name}-lambda-sg"
  description = "Allow Lambda to call out to the internet"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
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
          "arn:aws:s3:::${var.s3_bucket_name}/*"
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
          aws_lambda_function.fetch_data.arn,
          aws_lambda_function.process_content.arn,
          aws_lambda_function.store_data.arn,
          aws_lambda_function.render_video.arn,
          aws_lambda_function.check_duplicate.arn,
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
# IAM Policy for CloudWatch/EventBridge
#############################

resource "aws_iam_role" "eventbridge_role" {
  name = "${var.project_name}_eventbridge_step_functions_role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action    = "sts:AssumeRole",
      Effect    = "Allow",
      Principal = { Service = "events.amazonaws.com" }
    }]
  })
}

resource "aws_iam_policy" "eventbridge_policy" {
  name        = "${var.project_name}_eventbridge_step_functions_policy"
  description = "Policy for CloudWatch Event to start Step Functions executions"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect   = "Allow",
      Action   = "states:StartExecution",
      Resource = aws_sfn_state_machine.automated_workflow.arn
    }]
  })
}

resource "aws_iam_role_policy_attachment" "attach_eventbridge_policy" {
  role       = aws_iam_role.eventbridge_role.name
  policy_arn = aws_iam_policy.eventbridge_policy.arn
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

resource "aws_iam_role" "vpc_flow_logs_role" {
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

resource "aws_iam_role_policy" "vpc_flow_logs_role_policy" {
  name = "vpc-flow-logs-role-policy"
  role = aws_iam_role.vpc_flow_logs_role.id
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
## Cross-Account Role for Step Functions Invocation
#############################

data "aws_iam_policy_document" "cross_account_trust" {
  statement {
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = [
        "arn:aws:iam::${var.aws_account_ids.sharedservices}:root"
      ]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "cross_account_sfn_role" {
  name               = "CrossAccountStartExecutionRole"
  max_session_duration = 43200
  assume_role_policy = data.aws_iam_policy_document.cross_account_trust.json
}

data "aws_iam_policy_document" "cross_account_sfn_policy" {
  statement {
    effect = "Allow"
    actions = ["states:StartExecution"]
    resources = [
      aws_sfn_state_machine.manual_workflow.arn
    ]
  }
}

resource "aws_iam_role_policy" "allow_sfn_execution" {
  name   = "AllowCrossAccountStartExecution"
  role   = aws_iam_role.cross_account_sfn_role.id
  policy = data.aws_iam_policy_document.cross_account_sfn_policy.json
}

data "aws_iam_policy_document" "cross_account_sfn_resource_policy" {
  statement {
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = [
        "arn:aws:iam::${var.aws_account_ids.sharedservices}:role/CrossAccountStartExecutionRole",

        "arn:aws:iam::${var.aws_account_ids.sharedservices}:role/sharedservices_lambda_role"
      ]
    }

    actions = ["states:StartExecution"]

    resources = [
      "aws_sfn_state_machine.manual_workflow.arn"
    ]
  }
}

#############################
## SSM Automation Runbooks
#############################

data "aws_iam_policy_document" "ssm_role_policy" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ssm.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ssm_automation_role" {
  name = "SSMAutomationRole"
  path = "/"
  assume_role_policy = data.aws_iam_policy_document.ssm_role_policy.json
}

resource "aws_iam_role_policy_attachment" "attach_ssm_automation" {
  role       = aws_iam_role.ssm_automation_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonSSMAutomationRole"
}

resource "aws_iam_role_policy" "ssm_automation_allow_putresourcepolicy" {
  name   = "SSMAutomationAllowPutResourcePolicy"
  role   = aws_iam_role.ssm_automation_role.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect   = "Allow",
        Action   = "states:PutResourcePolicy",
        Resource = "*"
      }
    ]
  })
}

