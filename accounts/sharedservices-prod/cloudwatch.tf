################################################################################
## Cloudwatch
################################################################################

resource "aws_cloudwatch_log_group" "vpc_flow_logs" {
  name              = "/aws/vpc/flow_logs/${aws_vpc.API_vpc.id}"
  retention_in_days = 2
}