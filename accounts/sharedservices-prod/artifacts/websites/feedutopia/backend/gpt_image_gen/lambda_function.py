import json
import os
import logging
from typing import Any, Dict

from openai import OpenAI, OpenAIError

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
client = OpenAI(api_key=OPENAI_API_KEY)

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
    """Handle POST /gpt/image-gen with JSON {prompt,model,size[,refImageId]}."""
    if event.get("httpMethod") == "OPTIONS":
        return _response(200, {})

    try:
        body = json.loads(event.get("body") or "{}")
        prompt = body.get("prompt")
        model  = body.get("model")
        size   = body.get("size")
        ref_id = body.get("refImageId")

        if not prompt or not model or not size:
            return _response(400, {"error": "prompt, model and size are required"})

        gen_args: Dict[str, Any] = {
            "model":  model,
            "prompt": prompt,
            "size":   size,
            "n":      1,
        }
        if ref_id:
            gen_args["reference_image_id"] = ref_id

        log.info("Calling OpenAI images.generate with %s", gen_args)
        images = client.images.generate(**gen_args)
        url = images.data[0].url
        return _response(200, {"url": url})

    except OpenAIError as oe:
        log.exception("OpenAI API error")
        return _response(500, {"error": str(oe)})
    except Exception as exc:
        log.exception("image-gen failed")
        return _response(500, {"error": "Internal error"}) 