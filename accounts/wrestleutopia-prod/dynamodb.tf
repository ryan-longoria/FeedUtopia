################################################################################
## Dynamo DB
################################################################################

#############################
# Wrestler Profiles
#############################

resource "aws_dynamodb_table" "wrestlers" {
  name         = "${var.project_name}-WrestlerProfiles"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "handle"
    type = "S"
  }

  global_secondary_index {
    name            = "ByHandle"
    hash_key        = "handle"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"
}

#############################
# Profile Handles (unique handle registry)
#############################


resource "aws_dynamodb_table" "profile_handles" {
  name         = "${var.project_name}-ProfileHandles"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "handle"

  attribute {
    name = "handle"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"
}

#############################
# Promoter Profiles
#############################

resource "aws_dynamodb_table" "promoters" {
  name         = "${var.project_name}-PromoterProfiles"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute {
    name = "userId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"
}


#############################
# Tryouts
#############################


resource "aws_dynamodb_table" "tryouts" {
  name         = "${var.project_name}-Tryouts"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tryoutId"

  attribute {
    name = "tryoutId"
    type = "S"
  }
  attribute {
    name = "ownerId"
    type = "S"
  }
  attribute {
    name = "status"
    type = "S"
  }
  attribute {
    name = "date"
    type = "S"
  }

  global_secondary_index {
    name            = "ByOwner"
    hash_key        = "ownerId"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "OpenByDate"
    hash_key        = "status"
    range_key       = "date"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"
}

#############################
# Applications
#############################


resource "aws_dynamodb_table" "applications" {
  name         = "${var.project_name}-Applications"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "tryoutId"
  range_key    = "applicantId"

  attribute {
    name = "tryoutId"
    type = "S"
  }
  attribute {
    name = "applicantId"
    type = "S"
  }
  attribute {
    name = "applicantIdGsi"
    type = "S"
  }

  global_secondary_index {
    name            = "ByApplicant"
    hash_key        = "applicantIdGsi"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  server_side_encryption {
    enabled = true
  }

  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"
}