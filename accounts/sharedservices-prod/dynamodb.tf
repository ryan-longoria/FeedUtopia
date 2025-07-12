################################################################################
## DynamoDB
################################################################################

resource "aws_dynamodb_table" "weekly_todo" {
  name           = "WeeklyTodoTasks"
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "taskId"
  attribute {
    name = "taskId"
    type = "S"
  }
  tags = {
    Service = "FeedUtopia"
  }
}

resource "aws_dynamodb_table" "weekly_news_posts" {
  name         = "weekly_news_posts"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "accountName"
  range_key = "createdAt"

  attribute { 
    name = "accountName" 
    type = "S" 
  }
  attribute { 
    name = "createdAt"   
    type = "N" 
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  tags = var.common_tags
}
