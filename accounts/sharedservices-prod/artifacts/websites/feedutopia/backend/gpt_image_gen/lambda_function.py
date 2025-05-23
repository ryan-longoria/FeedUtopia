import json
import os
import logging
import io
from typing import Any, Dict

import boto3
from botocore.exceptions import ClientError
from PIL import Image
from openai import OpenAI, OpenAIError

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
UPLOAD_BUCKET  = os.environ.get("UPLOAD_BUCKET", "")

client = OpenAI(api_key=OPENAI_API_KEY)
s3     = boto3.client("s3")

log = logging.getLogger()
log.setLevel(logging.INFO)

CORS_HEADERS: Dict[str, str] = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
    "Content-Type":                 "application/json",
}


def _response(status: int, body: Any) -> Dict[str, Any]:
    return {
        "statusCode": status,
        "headers":    CORS_HEADERS,
        "body":       json.dumps(body),
    }


def lambda_handler(event, _ctx):
    log.info("got event: %s", event)

    if event.get("httpMethod") == "OPTIONS":
        return _response(200, {})

    try:
        body    = json.loads(event.get("body") or "{}")
        prompt  = body.get("prompt")
        model   = body.get("model")
        size    = body.get("size")
        ref_key = body.get("refImageId")

        if not prompt or not model or not size:
            return _response(400, {"error": "prompt, model and size are required"})

        if ref_key:
            if not UPLOAD_BUCKET:
                return _response(500, {"error": "UPLOAD_BUCKET not configured"})
            try:
                obj  = s3.get_object(Bucket=UPLOAD_BUCKET, Key=ref_key)
                data = obj["Body"].read()
            except ClientError as e:
                code = e.response.get("Error", {}).get("Code", "")
                if code == "NoSuchKey":
                    return _response(404, {"error": f"reference image '{ref_key}' not found"})
                log.exception("Error fetching reference from S3")
                return _response(500, {"error": "error retrieving reference image"})

            img_buf = io.BytesIO(data)
            img_buf.name = "reference.png"

            orig     = Image.open(io.BytesIO(data))
            mask_img = Image.new("RGBA", orig.size, (255,255,255,255))
            mask_buf = io.BytesIO()
            mask_img.save(mask_buf, format="PNG")
            mask_buf.name = "mask.png"
            mask_buf.seek(0)

            log.info("Calling OpenAI images.edit model=%s size=%s", model, size)
            resp = client.images.edit(
                image=img_buf,
                mask=mask_buf,
                prompt=prompt,
                n=1,
                size=size,
            )
            url = resp.data[0].url

        else:
            log.info("Calling OpenAI images.generate model=%s size=%s", model, size)
            gen = client.images.generate(
                model=model,
                prompt=prompt,
                n=1,
                size=size,
            )
            url = gen.data[0].url

        return _response(200, {"url": url})

    except OpenAIError as oe:
        log.exception("OpenAI API error")
        return _response(500, {"error": str(oe)})

    except Exception:
        log.exception("Unexpected failure in image-gen")
        return _response(500, {"error": "Internal error"})
