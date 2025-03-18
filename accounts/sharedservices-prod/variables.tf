################################################################################
## Terraform Variables
################################################################################

variable "project_name" {
  description = "Project name to prefix resource names (unique per account/environment)."
  type        = string
}

variable "aws_account_ids" {
  description = "The AWS Account ID. Used for configuring the provider and defining ECS resources."
  type = object({
    sharedservices = string
    animeutopia    = string
    wrestleutopia  = string
  })
}

variable "stepfunctions_arns" {
  type = map(string)
  default = {
    animeutopia   = "arn:aws:states:us-east-2:481665084477:stateMachine:anime_workflow",
    wrestleutopia = "arn:aws:states:us-east-2:390402544450:stateMachine:automated_workflow"
  }
}

variable "aws_region" {
  description = "The AWS region to deploy resources."
  type        = string
  default     = "us-east-2"
}

variable "environment" {
  description = "The environment name (nonprod, prod)."
  type        = string
  default     = "prod"
}

variable "terraform_backend_bucket" {
  description = "The S3 bucket used to store Terraform state."
  type        = string
}

variable "incidents_teams_webhook" {
  description = "The Teams webhook URL used to notify when an incident occurs."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
}

variable "aws_availability_zones" {
  description = "List of availability zones to use."
  type        = list(string)
}

variable "common_tags" {
  description = "A map of common tags to apply to all resources."
  type        = map(string)
  default = {
    DeployedBy  = "Terraform"
    Project     = "sharedservices"
    Environment = "prod"
  }
}