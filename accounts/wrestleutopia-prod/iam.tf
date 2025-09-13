################################################################################
## Identity and Access Management (IAM)
################################################################################

#############################
# S3 IAM
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
## Cross-Account IAM
#############################

data "aws_iam_policy_document" "crossaccount_s3_read_role_trust" {
  statement {
    sid    = "AllowSharedServicesAssumeRole"
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

resource "aws_iam_role" "crossaccount_s3_read_role" {
  name               = "CrossAccountS3ReadRole"
  assume_role_policy = data.aws_iam_policy_document.crossaccount_s3_read_role_trust.json
}

data "aws_iam_policy_document" "crossaccount_s3_read_policy_doc" {
  statement {
    sid    = "AllowGetLogo"
    effect = "Allow"
    actions = [
      "s3:*"
    ]
    resources = [
      "arn:aws:s3:::prod-${var.project_name}-artifacts-bucket/*"
    ]
  }
}

resource "aws_iam_role_policy" "crossaccount_s3_read_policy" {
  name   = "ReadLogo"
  role   = aws_iam_role.crossaccount_s3_read_role.id
  policy = data.aws_iam_policy_document.crossaccount_s3_read_policy_doc.json
}

#############################
## Lambda IAM
#############################

resource "aws_iam_role" "lambda_role" {
  name = "${var.project_name}-postconfirm-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_policy" "lambda_logs" {
  name        = "${var.project_name}-lambda-logs"
  description = "Allow Lambda to write CloudWatch logs"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      Resource = "*"
    }]
  })
}

resource "aws_iam_policy" "lambda_cognito_admin" {
  name        = "${var.project_name}-lambda-cognito-admin"
  description = "Allow Lambda to manage Cognito user groups and attributes"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Action = [
        "cognito-idp:AdminAddUserToGroup",
        "cognito-idp:AdminRemoveUserFromGroup",
        "cognito-idp:AdminGetUser",
        "cognito-idp:AdminUpdateUserAttributes"
      ],
      Resource = aws_cognito_user_pool.this.arn
    }]
  })
}

resource "aws_iam_role_policy_attachment" "logs_attach" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.lambda_logs.arn
}

resource "aws_iam_role_policy_attachment" "cog_attach" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.lambda_cognito_admin.arn
}

resource "aws_lambda_permission" "allow_cognito_invoke" {
  statement_id  = "AllowExecutionFromCognito"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.add_to_group.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.this.arn
}

resource "aws_iam_role" "cognito_cleanup_role" {
  name = "${var.project_name}-cognito-cleanup-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "sts:AssumeRole"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_policy" "cognito_cleanup_policy" {
  name        = "${var.project_name}-cognito-cleanup-policy"
  description = "List and delete UNCONFIRMED Cognito users"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect: "Allow",
        Action: [
          "cognito-idp:ListUsers",
          "cognito-idp:AdminDeleteUser"
        ],
        Resource: aws_cognito_user_pool.this.arn
      },
      {
        Effect: "Allow",
        Action: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Resource: "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "cognito_cleanup_attach" {
  role       = aws_iam_role.cognito_cleanup_role.name
  policy_arn = aws_iam_policy.cognito_cleanup_policy.arn
}

resource "aws_lambda_permission" "allow_events_cleanup" {
  statement_id  = "AllowEventInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cognito_cleanup.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.cognito_cleanup_rule.arn
}

#############################
## Lambda IAM — API (CRUD)
#############################

resource "aws_iam_role" "api_lambda_role" {
  name = "${var.project_name}-api-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

# EXISTING policy: api_dynamo_policy
resource "aws_iam_policy" "api_dynamo_policy" {
  name        = "${var.project_name}-api-dynamo"
  description = "CRUD on WrestlerProfiles, PromoterProfiles, Tryouts (+GSIs), Applications (+GSIs)"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "CrudOnTables",
        Effect = "Allow",
        Action = [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:TransactWriteItems",
          "dynamodb:ConditionCheckItem"
        ],
        Resource = [
          aws_dynamodb_table.wrestlers.arn,
          aws_dynamodb_table.promoters.arn,
          aws_dynamodb_table.tryouts.arn,
          "${aws_dynamodb_table.tryouts.arn}/index/*",
          aws_dynamodb_table.applications.arn,
          "${aws_dynamodb_table.applications.arn}/index/*",

          aws_dynamodb_table.profile_handles.arn,
          "${aws_dynamodb_table.wrestlers.arn}/index/*"
        ]
      }
    ]
  })
}


resource "aws_iam_policy" "api_s3_media_policy" {
  name        = "${var.project_name}-api-s3-media"
  description = "Allow API Lambda limited S3 access under user/* prefix"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "UserPrefixRW"
        Effect = "Allow",
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ],
        Resource = "arn:aws:s3:::${var.s3_bucket_name}/user/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "api_logs_attach" {
  role       = aws_iam_role.api_lambda_role.name
  policy_arn = aws_iam_policy.lambda_logs.arn
}

resource "aws_iam_role_policy_attachment" "api_dynamo_attach" {
  role       = aws_iam_role.api_lambda_role.name
  policy_arn = aws_iam_policy.api_dynamo_policy.arn
}

resource "aws_iam_role_policy_attachment" "api_s3_media_attach" {
  role       = aws_iam_role.api_lambda_role.name
  policy_arn = aws_iam_policy.api_s3_media_policy.arn
}

resource "aws_lambda_permission" "api_invoke" {
  statement_id  = "AllowAPIGwInvokeApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

resource "aws_lambda_permission" "presign_invoke" {
  statement_id  = "AllowAPIGwInvokePresign"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.presign.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

#############################
## Lambda IAM — Presign (S3 PUT)
#############################

resource "aws_iam_role" "presign_lambda_role" {
  name = "${var.project_name}-presign-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_policy" "presign_s3_policy" {
  name        = "${var.project_name}-presign-s3"
  description = "Allow presign Lambda to sign S3 PUTs under user/* prefix"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "AllowPutOnUserPrefix",
        Effect = "Allow",
        Action = [
          "s3:PutObject"
        ],
        Resource = "arn:aws:s3:::${var.s3_bucket_name}/user/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "presign_logs_attach" {
  role       = aws_iam_role.presign_lambda_role.name
  policy_arn = aws_iam_policy.lambda_logs.arn
}

resource "aws_iam_role_policy_attachment" "presign_s3_attach" {
  role       = aws_iam_role.presign_lambda_role.name
  policy_arn = aws_iam_policy.presign_s3_policy.arn
}

#############################
## API IAM
#############################

