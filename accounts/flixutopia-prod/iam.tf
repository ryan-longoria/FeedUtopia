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