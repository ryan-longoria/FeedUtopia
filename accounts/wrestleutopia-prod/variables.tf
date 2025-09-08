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
    wrestleutopia  = string
    sharedservices = string
  })
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

variable "s3_bucket_name" {
  description = "Name of the S3 bucket for storing processed data."
  type        = string
}

variable "terraform_backend_bucket" {
  description = "The S3 bucket used to store Terraform state."
  type        = string
}

variable "teams_webhooks" {
  description = "Microsoft Teams account specific webhooks"
  type = object({
    wrestleutopia = object({
      auto   = string
      manual = string
    })
  })
}

variable "incidents_teams_webhook" {
  description = "The Teams webhook URL used to notify when an incident occurs."
  type        = string
}

variable "common_tags" {
  description = "A map of common tags to apply to all resources."
  type        = map(string)
  default = {
    DeployedBy  = "Terraform"
    Project     = "wrestleutopia"
    Environment = "prod"
  }
}

variable "cognito_domain_prefix" { 
  type = string 
  default = "wrestleutopia-auth" 
}

variable "callback_urls" { 
  type = list(string) 
}

variable "logout_urls" { 
  type = list(string) 
}

variable "enable_hosted_ui" { 
  type = bool 
  default = true 
}