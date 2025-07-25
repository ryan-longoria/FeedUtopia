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
    driftutopia    = string
    xputopia       = string
    critterutopia  = string
    cyberutopia    = string
    flixutopia     = string
  })
}

variable "teams_webhooks" {
  description = "Microsoft Teams account specific webhooks"
  type = object({
    wrestleutopia = object({
      auto   = string
      manual = string
    }),

    animeutopia = object({
      auto   = string
      manual = string
    }),

    driftutopia = object({
      auto   = string
      manual = string
    }),

    xputopia = object({
      auto   = string
      manual = string
    }),

    critterutopia = object({
      auto   = string
      manual = string
    }),

    cyberutopia = object({
      auto   = string
      manual = string
    }),

    flixutopia = object({
      auto   = string
      manual = string
    })
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

variable "render_video_image_uri" {
  description = "The uri used to render lambda function render_video."
  type        = string
}

variable "weekly_recap_image_uri" {
  type        = string
  description = "ECR image URI for weekly_news_recap container"
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

variable "weekly_recap_cpu" { 
  default = 1024 
}
variable "weekly_recap_memory" { 
  default = 2048 
}

variable "gpt_model" {
  type        = string
}