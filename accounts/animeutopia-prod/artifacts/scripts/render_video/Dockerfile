FROM public.ecr.aws/lambda/python:3.9

COPY requirements.txt .

RUN python3 -m pip install --no-cache-dir --force-reinstall -r requirements.txt

RUN mkdir -p /opt/bin
COPY bin/ffmpeg /opt/bin/ffmpeg
RUN chmod +x /opt/bin/ffmpeg

ENV FFMPEG_PATH="/opt/bin/ffmpeg"

COPY lambda_function.py /var/task

CMD [ "lambda_function.lambda_handler" ]