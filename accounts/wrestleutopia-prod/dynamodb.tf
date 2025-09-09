################################################################################
## Dynamo DB
################################################################################

resource "aws_dynamodb_table" "wrestlers" {
  name         = "${var.project_name}-WrestlerProfiles"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute { 
    name = "userId" 
    type = "S" 
  }
}

resource "aws_dynamodb_table" "promoters" {
  name         = "${var.project_name}-PromoterProfiles"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"

  attribute { 
    name = "userId" 
    type = "S" 
  }
}

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
    name               = "OpenByDate"
    hash_key           = "status"
    range_key          = "date"
    projection_type    = "ALL"
  }
}

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
}