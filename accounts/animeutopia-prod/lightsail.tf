################################################################################
## Lightsail
################################################################################

resource "aws_lightsail_instance" "ecommerce" {
  provider          = aws
  name              = "${var.project_name}-lamp"
  availability_zone = "us-east-2a"
  blueprint_id      = "lamp-8-3-17"
  bundle_id         = "medium_2_0"

  user_data = <<-EOF
#!/bin/bash
apt-get update -y
apt-get upgrade -y

echo "<h1>Welcome to AnimeUtopiaStore!</h1>" > /opt/bitnami/apache/htdocs/index.html

EOF
}