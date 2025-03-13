FROM public.ecr.aws/lambda/python:3.9

COPY requirements.txt .

RUN python3 -m pip install --no-cache-dir --force-reinstall -r requirements.txt

RUN mkdir -p /opt/bin
COPY bin/ffmpeg /opt/bin/ffmpeg
RUN chmod +x /opt/bin/ffmpeg

ENV FFMPEG_PATH="/opt/bin/ffmpeg"

RUN yum install -y epel-release && \
    yum install -y cabextract fontconfig wget && \
    mkdir -p /usr/share/fonts/truetype/msttcorefonts && \
    wget -O /tmp/arialblk.ttf https://downloads.sourceforge.net/corefonts/arialblk.ttf && \
    mv /tmp/arialblk.ttf /usr/share/fonts/truetype/msttcorefonts/arialblk.ttf && \
    fc-cache -f -v

COPY lambda_function.py /var/task

CMD [ "lambda_function.lambda_handler" ]
