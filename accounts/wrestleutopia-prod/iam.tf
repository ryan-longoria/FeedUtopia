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
  description = "Allow Lambda to add users to Cognito groups"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Action = ["cognito-idp:AdminAddUserToGroup"],
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

resource "aws_iam_role_policy" "add_to_group_cognito_admin" {
  name = "cognito-admin-add-to-group"
  role = aws_iam_role.add_to_group_role.name

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "CognitoAdminOps",
        Effect = "Allow",
        Action = [
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminRemoveUserFromGroup",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminUpdateUserAttributes"
        ],
        Resource = "arn:aws:cognito-idp:${var.aws_region}:${data.aws_caller_identity.current.account_id}:userpool/${aws_cognito_user_pool.this.id}"
      }
    ]
  })
}

resource "aws_iam_role_policy" "add_to_group_logs" {
  name = "lambda-logs"
  role = aws_iam_role.add_to_group_role.name

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Resource = "*"
      }
    ]
  })
}

resource "aws_lambda_permission" "allow_cognito_invoke" {
  statement_id  = "AllowExecutionFromCognito"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.add_to_group.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.this.arn
}