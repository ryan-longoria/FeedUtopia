FROM public.ecr.aws/lambda/python:3.9

RUN yum install -y ffmpeg aws-cli

RUN mkdir -p /assets/fonts

RUN aws s3 cp s3://utopia-account-artifacts/fonts/ariblk.ttf /assets/fonts/ariblk.ttf

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY render_video.py ./

CMD [ "render_video.handler" ]