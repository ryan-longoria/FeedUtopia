FROM public.ecr.aws/lambda/python:3.9

COPY requirements.txt .

RUN python3 -m pip install --no-cache-dir --force-reinstall -r requirements.txt

RUN mkdir -p /opt/bin
COPY bin/ffmpeg /opt/bin/ffmpeg
RUN chmod +x /opt/bin/ffmpeg

ENV FFMPEG_PATH="/opt/bin/ffmpeg"

RUN yum install -y fontconfig wget && \
    mkdir -p /usr/share/fonts/truetype/msttcorefonts && \
    wget -O /tmp/ARIBLK.TTF https://github.com/yourusername/yourrepo/raw/main/ARIBLK.TTF && \
    mv /tmp/ARIBLK.TTF /usr/share/fonts/truetype/msttcorefonts/ARIBLK.TTF && \
    fc-cache -f -v

COPY lambda_function.py /var/task

CMD [ "lambda_function.lambda_handler" ]