aws ecr get-login-password --region us-east-2 |
    docker login --username AWS --password-stdin `
        825765422855.dkr.ecr.us-east-2.amazonaws.com

Set-Location -Path "artifacts\websites\feedutopia\backend\weekly_news_recap"

docker buildx build --platform=linux/amd64 --provenance=false --load `
    -t weekly_news_recap_image:latest .

docker tag weekly_news_recap_image:latest `
    825765422855.dkr.ecr.us-east-2.amazonaws.com/weekly_news_recap_repository:latest

docker push 825765422855.dkr.ecr.us-east-2.amazonaws.com/weekly_news_recap_repository:latest

Set-Location -Path "..\..\..\..\.."