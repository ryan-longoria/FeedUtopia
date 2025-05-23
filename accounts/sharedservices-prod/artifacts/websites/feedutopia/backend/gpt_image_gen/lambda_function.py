import json
import os
import logging
from typing import Any, Dict

import boto3
from openai import OpenAI, OpenAIError

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
UPLOAD_BUCKET   = os.environ.get("UPLOAD_BUCKET", "")

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
    return {"statusCode": status, "headers": CORS_HEADERS, "body": json.dumps(body)}


def lambda_handler(event, _ctx):
    log.info("Event: %s", event)

    if event.get("httpMethod") == "OPTIONS":
        return _response(200, {})

    try:
        body    = json.loads(event.get("body") or "{}")
        prompt  = body.get("prompt")
        ref_key = body.get("refImageId")

        if not prompt:
            return _response(400, {"error": "prompt is required"})

        inputs = []
        if ref_key:
            if not UPLOAD_BUCKET:
                return _response(500, {"error": "UPLOAD_BUCKET not configured"})

            ref_url = s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": UPLOAD_BUCKET, "Key": ref_key},
                ExpiresIn=3600,
            )
            inputs.append({
                "type":      "input_image",
                "image_url": ref_url
            })

        inputs.append({
            "type": "input_text",
            "text": prompt
        })

        resp = client.responses.create(
            model="gpt-4.1-mini",
            input=inputs,
            tools=[{
                "type": "image_generation",
                "size": "1024x1536"
            }]
        )

        gen_call = next(
            (o for o in resp.output if o.type == "image_generation_call"),
            None
        )
        if not gen_call:
            return _response(500, {"error": "no image_generation_call in response"})

        b64_img = gen_call.result

        html = (
            f'<img src="data:image/png;base64,{b64_img}" '
            'style="width:100%;border-radius:12px" alt="Generated image">'
        )
        return _response(200, {"html": html})

    except OpenAIError as oe:
        log.exception("OpenAI API error")
        return _response(500, {"error": str(oe)})

    except Exception:
        log.exception("Unexpected failure")
        return _response(500, {"error": "Internal error"})
