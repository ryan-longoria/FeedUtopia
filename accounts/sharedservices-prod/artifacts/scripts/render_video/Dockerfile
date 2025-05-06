FROM public.ecr.aws/lambda/python:3.9

COPY requirements.txt .
RUN python3 -m pip install --no-cache-dir --force-reinstall -r requirements.txt

RUN python3 -m pip install --no-cache-dir botocore==1.34.* \
 && yum install -y amazon-efs-utils

RUN mkdir -p /opt/bin
COPY bin/ffmpeg /opt/bin/ffmpeg
RUN chmod +x /opt/bin/ffmpeg
ENV FFMPEG_PATH="/opt/bin/ffmpeg"

RUN yum install -y libwebp libwebp-devel

RUN yum install -y fontconfig wget unzip curl && \
    mkdir -p /usr/share/fonts/truetype/msttcorefonts && \
    wget -O /tmp/ariblk.ttf \
      https://raw.githubusercontent.com/ryan-longoria/FeedUtopia/main/accounts/animeutopia-prod/artifacts/adobe/ariblk.ttf && \
    mv /tmp/ariblk.ttf /usr/share/fonts/truetype/msttcorefonts/ariblk.ttf && \
    wget -O /tmp/Montserrat-Medium.ttf \
      https://raw.githubusercontent.com/ryan-longoria/FeedUtopia/main/accounts/animeutopia-prod/artifacts/adobe/Montserrat-Medium.ttf && \
    mv /tmp/Montserrat-Medium.ttf /usr/share/fonts/truetype/msttcorefonts/Montserrat-Medium.ttf && \
    fc-cache -f -v

COPY lambda_function.py /var/task

CMD [ "lambda_function.lambda_handler" ]
