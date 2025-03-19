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

resource "aws_lambda_permission" "allow_api_gateway_invoke_api_router" {
  statement_id  = "AllowAPIGatewayInvokeApiRouter"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api_router.function_name
  principal     = "apigateway.amazonaws.com"
.
  source_arn    = "arn:aws:execute-api:${var.aws_region}:${data.aws_caller_identity.current.account_id}:${aws_api_gateway_rest_api.api.id}/*"
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

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect    = "Allow"
    actions   = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "external_lambda_role" {
  name               = "ExternalLambdaRole"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "external_lambda_permissions" {
  statement {
    effect   = "Allow"
    actions  = ["sts:AssumeRole"]

    resources = var.cross_account_role_arns
  }
}

resource "aws_iam_role_policy" "external_lambda_policy" {
  name   = "AllowAssumeRoleInMultipleHosts"
  role   = aws_iam_role.external_lambda_role.id
  policy = data.aws_iam_policy_document.external_lambda_permissions.json
}