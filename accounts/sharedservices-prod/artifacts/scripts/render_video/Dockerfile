FROM python:3.13-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg fontconfig wget curl unzip \
        nfs-common  amazon-efs-utils  && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt \
 && pip install --no-cache-dir botocore==1.34.*

RUN mkdir -p /usr/share/fonts/truetype/msttcorefonts && \
    wget -q -O /usr/share/fonts/truetype/msttcorefonts/ariblk.ttf \
      https://raw.githubusercontent.com/ryan-longoria/FeedUtopia/main/accounts/animeutopia-prod/artifacts/adobe/ariblk.ttf && \
    wget -q -O /usr/share/fonts/truetype/msttcorefonts/Montserrat-Medium.ttf \
      https://raw.githubusercontent.com/ryan-longoria/FeedUtopia/main/accounts/animeutopia-prod/artifacts/adobe/Montserrat-Medium.ttf && \
    fc-cache -f -v

COPY lambda_function.py /app/lambda_function.py
WORKDIR /app

ENTRYPOINT ["python", "lambda_function.py"]