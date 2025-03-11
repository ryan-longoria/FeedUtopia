resource "aws_lambda_layer_version" "moviepy_layer" {
  layer_name          = "moviepy-layer"
  filename            = "${path.module}/artifacts/layers/moviepy_layer.zip"
  compatible_runtimes = ["python3.9"]
  description         = "MoviePy and FFmpeg dependencies"
}
