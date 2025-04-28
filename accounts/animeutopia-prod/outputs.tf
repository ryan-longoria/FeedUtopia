################################################################################
## Outputs
################################################################################

output "ann_proxy_invoke_url" {
  value = "${aws_apigatewayv2_stage.ann_proxy_stage.invoke_url}/newsroom/rss.xml"
}