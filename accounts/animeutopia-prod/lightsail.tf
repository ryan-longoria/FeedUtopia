################################################################################
## Lightsail
################################################################################

resource "aws_lightsail_instance" "ecommerce" {
  name              = "${var.project_name}-lamp"
  availability_zone = "us-east-2a"
  blueprint_id      = "prestashop_bitnami"
  bundle_id         = "small_3_0"

  user_data = <<-EOF
#!/bin/bash
apt-get update -y
apt-get upgrade -y

EOF
}

resource "aws_lightsail_static_ip" "ecommerce_ip" {
  name     = "${var.project_name}-lamp-static-ip"
}

resource "aws_lightsail_static_ip_attachment" "ecommerce_ip_attachment" {
  provider         = aws
  static_ip_name   = aws_lightsail_static_ip.ecommerce_ip.name
  instance_name    = aws_lightsail_instance.ecommerce.name

  depends_on = [aws_lightsail_instance.ecommerce]
}