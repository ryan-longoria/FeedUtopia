################################################################################
## Networking
################################################################################

resource "aws_vpc" "API_vpc" {
  cidr_block = var.vpc_cidr
}

resource "aws_flow_log" "vpc_flow_logs" {
  traffic_type         = "ALL"
  vpc_id               = aws_vpc.API_vpc.id
  iam_role_arn         = aws_iam_role.api_vpc_flow_logs_role.arn
  log_destination_type = "cloud-watch-logs"
  log_destination      = aws_cloudwatch_log_group.vpc_flow_logs.arn
}

resource "aws_internet_gateway" "API_igw" {
  vpc_id = aws_vpc.API_vpc.id
}

resource "aws_subnet" "API_public_subnet_1" {
  vpc_id                  = aws_vpc.API_vpc.id
  cidr_block             = "10.1.1.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true
}

resource "aws_subnet" "API_public_subnet_2" {
  vpc_id                  = aws_vpc.API_vpc.id
  cidr_block             = "10.1.2.0/24"
  availability_zone       = "${var.aws_region}b"
  map_public_ip_on_launch = true
}

resource "aws_route_table" "API_public_rt" {
  vpc_id = aws_vpc.API_vpc.id
}

resource "aws_route_table_association" "API_public_rt_assoc_1" {
  subnet_id      = aws_subnet.API_public_subnet_1.id
  route_table_id = aws_route_table.API_public_rt.id
}

resource "aws_route_table_association" "API_public_rt_assoc_2" {
  subnet_id      = aws_subnet.API_public_subnet_2.id
  route_table_id = aws_route_table.API_public_rt.id
}

resource "aws_route" "API_default_route_public" {
  route_table_id         = aws_route_table.API_public_rt.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.API_igw.id
}

resource "aws_vpc_endpoint" "s3_endpoint" {
  vpc_id            = aws_vpc.API_vpc.id
  service_name      = "com.amazonaws.us-east-2.s3"
  route_table_ids   = [
    aws_route_table.API_public_rt.id
  ]
}