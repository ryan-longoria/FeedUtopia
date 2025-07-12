FROM python:3.13-slim

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        ffmpeg fontconfig wget curl unzip \
        nfs-common python3-botocore; \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

RUN mkdir -p /usr/share/fonts/truetype/msttcorefonts && \
    wget -q -O /usr/share/fonts/truetype/msttcorefonts/ariblk.ttf \
      https://raw.githubusercontent.com/ryan-longoria/FeedUtopia/main/accounts/animeutopia-prod/artifacts/adobe/ariblk.ttf && \
    wget -q -O /usr/share/fonts/truetype/msttcorefonts/Montserrat-Medium.ttf \
      https://raw.githubusercontent.com/ryan-longoria/FeedUtopia/main/accounts/animeutopia-prod/artifacts/adobe/Montserrat-Medium.ttf && \
    fc-cache -f -v

WORKDIR /app
COPY lambda_function.py .

RUN adduser --disabled-password --gecos '' appuser
USER appuser

ENTRYPOINT ["python", "lambda_function.py"]