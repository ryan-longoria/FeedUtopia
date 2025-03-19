################################################################################
## Elastic File System (EFS)
################################################################################

resource "aws_efs_file_system" "lambda_efs" {
  creation_token   = "lambda-efs"
  performance_mode = "generalPurpose"
  encrypted        = true
}

resource "aws_security_group" "efs_sg" {
  name        = "efs_lambda_sg"
  description = "Security group for EFS mount for Lambda"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 2049
    to_port     = 2049
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_efs_mount_target" "efs_mount" {
  file_system_id  = aws_efs_file_system.lambda_efs.id
  subnet_id       = aws_subnet.public_subnet.id
  security_groups = [aws_security_group.efs_sg.id]
}

resource "aws_efs_access_point" "lambda_ap" {
  file_system_id = aws_efs_file_system.lambda_efs.id

  posix_user {
    uid = 1000
    gid = 1000
  }

  root_directory {
    path = "/lambda"
    creation_info {
      owner_uid   = 1000
      owner_gid   = 1000
      permissions = "755"
    }
  }
}
