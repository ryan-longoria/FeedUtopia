# Change directory to where your Dockerfile is located.
Set-Location -Path "artifacts/scripts/render_video"

# Build the Docker image.
docker buildx build --platform=linux/amd64 --provenance=false --load -t render_video_image:latest .

# Tag the Docker image.
docker tag render_video_image:latest 481665084477.dkr.ecr.us-east-2.amazonaws.com/render_video_repository:latest

# Push the Docker image to the repository.
docker push 481665084477.dkr.ecr.us-east-2.amazonaws.com/render_video_repository:latest

Set-Location -Path "../../.."