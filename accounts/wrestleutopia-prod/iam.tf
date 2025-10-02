################################################################################
## Identity and Access Management (IAM)
################################################################################

#############################
# S3 IAM
#############################

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "media_cf_access" {
  statement {
    sid     = "AllowCloudFrontOACRead"
    effect  = "Allow"
    actions = ["s3:GetObject"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    resources = [
      "${aws_s3_bucket.media_bucket.arn}/public/*",
      "${aws_s3_bucket.media_bucket.arn}/posts/*",
    ]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values = [
        "arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${aws_cloudfront_distribution.media.id}"
      ]
    }
  }

  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    resources = [
      aws_s3_bucket.media_bucket.arn,
      "${aws_s3_bucket.media_bucket.arn}/*"
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }

  statement {
    sid     = "DenyUnencryptedObjectUploads"
    effect  = "Deny"
    actions = ["s3:PutObject"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    resources = ["${aws_s3_bucket.media_bucket.arn}/*"]

    condition {
      test     = "StringNotEquals"
      variable = "s3:x-amz-server-side-encryption"
      values   = ["AES256"]
    }
  }

  statement {
    sid    = "DenyIfNotFromOurOrg"
    effect = "Deny"

    actions = [
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:AbortMultipartUpload",
      "s3:PutObjectTagging",
      "s3:DeleteObjectTagging"
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    resources = ["${aws_s3_bucket.media_bucket.arn}/*"]

    condition {
      test     = "StringNotEqualsIfExists"
      variable = "aws:PrincipalOrgID"
      values   = ["o-4uer5s3xlw"]
    }

    condition {
      test     = "ArnNotEqualsIfExists"
      variable = "AWS:SourceArn"
      values   = ["arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${aws_cloudfront_distribution.media.id}"]
    }
  }
}

resource "aws_s3_bucket_policy" "media_cf" {
  bucket     = aws_s3_bucket.media_bucket.id
  policy     = data.aws_iam_policy_document.media_cf_access.json
  depends_on = [aws_cloudfront_distribution.media]
}

data "aws_iam_policy_document" "cloudtrail_logs" {
  statement {
    sid    = "AWSCloudTrailAclCheck"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    actions   = ["s3:GetBucketAcl"]
    resources = [aws_s3_bucket.cloudtrail_logs.arn]
  }

  statement {
    sid    = "AWSCloudTrailWrite"
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.cloudtrail_logs.arn}/AWSLogs/${data.aws_caller_identity.current.account_id}/*"]
  }
}


resource "aws_s3_bucket_policy" "cloudtrail_logs" {
  bucket = aws_s3_bucket.cloudtrail_logs.id
  policy = data.aws_iam_policy_document.cloudtrail_logs.json
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
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
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
      Effect   = "Allow",
      Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
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
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
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
        Effect : "Allow",
        Action : [
          "cognito-idp:ListUsers",
          "cognito-idp:AdminDeleteUser"
        ],
        Resource : aws_cognito_user_pool.this.arn
      },
      {
        Effect : "Allow",
        Action : [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Resource : "*"
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

resource "aws_iam_role" "pre_signup_role" {
  name = "${var.project_name}-pre-signup-role"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17",
    Statement = [{ Effect = "Allow", Action = "sts:AssumeRole", Principal = { Service = "lambda.amazonaws.com" } }]
  })
}

resource "aws_iam_role_policy_attachment" "pre_signup_logs" {
  role       = aws_iam_role.pre_signup_role.name
  policy_arn = aws_iam_policy.lambda_logs.arn
}

resource "aws_lambda_permission" "allow_cognito_presignup" {
  statement_id  = "AllowExecutionFromCognitoPreSignUp"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pre_signup.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.this.arn
}

resource "aws_iam_policy" "postconfirm_dynamo" {
  name        = "${var.project_name}-postconfirm-dynamo"
  description = "Allow post-confirm Lambda to create initial profile rows"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Action = [
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:GetItem"
      ],
      Resource = [
        aws_dynamodb_table.wrestlers.arn,
        aws_dynamodb_table.promoters.arn,
        aws_dynamodb_table.profile_handles.arn
      ]
    }]
  })
}

resource "aws_iam_role_policy_attachment" "postconfirm_dynamo_attach" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = aws_iam_policy.postconfirm_dynamo.arn
}

resource "aws_lambda_permission" "apigw_invoke_upload_url" {
  statement_id  = "AllowAPIGwInvokeUploadUrl"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.upload_url.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.image_processor.arn
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.s3_raw_puts.arn
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
          "dynamodb:BatchGetItem", # ✅ add this
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
  description = "Allow API Lambda read (and optional delete) on public assets"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "ReadPublic"
        Effect = "Allow",
        Action = ["s3:GetObject"],
        Resource = [
          "arn:aws:s3:::${var.s3_bucket_name}/public/wrestlers/*",
          "arn:aws:s3:::${var.s3_bucket_name}/public/promoters/*",
          "arn:aws:s3:::${var.s3_bucket_name}/posts/*"
        ]
      },
      {
        Sid    = "OptionalDeletePublic"
        Effect = "Allow",
        Action = ["s3:DeleteObject"],
        Resource = [
          "arn:aws:s3:::${var.s3_bucket_name}/public/wrestlers/*",
          "arn:aws:s3:::${var.s3_bucket_name}/public/promoters/*"
        ]
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

resource "aws_iam_policy" "presign_dynamo_policy" {
  name        = "${var.project_name}-presign-dynamo"
  description = "Allow presign Lambda to create/update media items in tryouts table"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "WriteMediaItems",
        Effect = "Allow",
        Action = [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:GetItem"
        ],
        Resource = aws_dynamodb_table.tryouts.arn
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "presign_dynamo_attach" {
  role       = aws_iam_role.presign_lambda_role.name
  policy_arn = aws_iam_policy.presign_dynamo_policy.arn
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
  description = "Allow presign Lambda to sign S3 PUTs"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid      = "AllowPutOnRawPrefix",
        Effect   = "Allow",
        Action   = ["s3:PutObject", "s3:GetObject"],
        Resource = "arn:aws:s3:::${var.s3_bucket_name}/raw/uploads/*"
      },
      {
        Sid    = "AllowPutOnPublicProfiles",
        Effect = "Allow",
        Action = ["s3:PutObject", "s3:GetObject", "s3:AbortMultipartUpload", "s3:PutObjectTagging"],
        Resource = [
          "arn:aws:s3:::${var.s3_bucket_name}/public/wrestlers/profiles/*",
          "arn:aws:s3:::${var.s3_bucket_name}/public/promoters/profiles/*"
        ],
        Condition = {
          StringEquals = { "s3:x-amz-server-side-encryption" = "AES256" }
        }
      },
      {
        Sid    = "AllowPutOnPublicGalleryAndHighlights"
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:GetObject", "s3:AbortMultipartUpload", "s3:PutObjectTagging"]
        Resource = [
          "arn:aws:s3:::${var.s3_bucket_name}/public/wrestlers/gallery/*",
          "arn:aws:s3:::${var.s3_bucket_name}/public/promoters/gallery/*",
          "arn:aws:s3:::${var.s3_bucket_name}/public/wrestlers/highlights/*",
          "arn:aws:s3:::${var.s3_bucket_name}/public/promoters/highlights/*"
        ]
        Condition = {
          StringEquals = { "s3:x-amz-server-side-encryption" = "AES256" }
        }
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

resource "aws_iam_role" "image_processor_role" {
  name = "${var.project_name}-image-processor-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Action    = "sts:AssumeRole",
      Effect    = "Allow",
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_policy" "image_processor_policy" {
  name        = "${var.project_name}-image-processor"
  description = "Image processor: read raw/uploads/*, write public images, update media item in DynamoDB"
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid      = "S3ReadRaw",
        Effect   = "Allow",
        Action   = ["s3:GetObject"],
        Resource = "arn:aws:s3:::${var.s3_bucket_name}/raw/uploads/*"
      },
      {
        Sid    = "S3WritePublicImages",
        Effect = "Allow",
        Action = ["s3:PutObject"],
        Resource = [
          "arn:aws:s3:::${var.s3_bucket_name}/public/wrestlers/images/*",
          "arn:aws:s3:::${var.s3_bucket_name}/public/promoters/images/*"
        ]
      },
      {
        Sid    = "DynamoUpdateMedia",
        Effect = "Allow",
        Action = [
          "dynamodb:UpdateItem",
          "dynamodb:GetItem"
        ],
        Resource = aws_dynamodb_table.tryouts.arn
      },
      {
        Sid    = "AllowPutOnPublicGalleryAndHighlights"
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:GetObject", "s3:AbortMultipartUpload", "s3:PutObjectTagging"]
        Resource = [
          "arn:aws:s3:::${var.s3_bucket_name}/public/wrestlers/gallery/*",
          "arn:aws:s3:::${var.s3_bucket_name}/public/promoters/gallery/*",
          "arn:aws:s3:::${var.s3_bucket_name}/public/wrestlers/highlights/*",
          "arn:aws:s3:::${var.s3_bucket_name}/public/promoters/highlights/*"
        ]
        Condition = {
          StringEquals = { "s3:x-amz-server-side-encryption" = "AES256" }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "image_processor_logs_attach" {
  role       = aws_iam_role.image_processor_role.name
  policy_arn = aws_iam_policy.lambda_logs.arn
}

resource "aws_iam_role_policy_attachment" "image_processor_attach" {
  role       = aws_iam_role.image_processor_role.name
  policy_arn = aws_iam_policy.image_processor_policy.arn
}