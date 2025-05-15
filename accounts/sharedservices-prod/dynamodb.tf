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
