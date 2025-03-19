################################################################################
## Identity and Access Management (IAM)
################################################################################

#############################
# IAM Policy for API Gateway
#############################

resource "aws_iam_role" "apigw_stepfunctions_role" {
  name = "APIGW-StepFunctions-CrossAccountRole"

  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "apigateway.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
  tags = {
    Name = "API-Gateway-to-StepFunctions-Role"
  }
}

resource "aws_iam_role_policy" "apigw_stepfunctions_policy" {
  name = "AllowStartExecutionInMultipleAccounts"
  role = aws_iam_role.apigw_stepfunctions_role.id

  policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "states:StartExecution",
      "Resource": ${jsonencode(values(var.stepfunctions_arns))}
    }
  ]
}
EOF
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

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_lambda_permission" "allow_sns_invoke" {
  statement_id  = "AllowExecutionFromSNS"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.sns_to_teams.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.monitoring_topic.arn
}

resource "aws_iam_role_policy_attachment" "lambda_vpc_access" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
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