aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-2.amazonaws.com

Set-Location -Path "artifacts/scripts/render_video"

docker buildx build --platform=linux/amd64 --provenance=false --load -t render_video_image:latest .

docker tag render_video_image:latest 123456789012.dkr.ecr.us-east-2.amazonaws.com/render_video_repository:latest

docker push 123456789012.dkr.ecr.us-east-2.amazonaws.com/render_video_repository:latest

Set-Location -Path "../../.."