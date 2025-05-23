from __future__ import annotations
import json, os, logging
from typing import Any, Dict

from openai import OpenAI
from openai.types import ImagesResponse

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
MODEL = os.environ.get("IMAGE_MODEL", "gpt-image-1")
SIZE  = "1080x1920"

client  = OpenAI(api_key=OPENAI_API_KEY)
log     = logging.getLogger()
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
    if event.get("httpMethod") == "OPTIONS":
        return _response(200, {})

    try:
        body = json.loads(event.get("body") or "{}")
        prompt: str | None = body.get("prompt")
        ref_id: str | None = body.get("refImageId")

        if not prompt:
            return _response(400, {"error": "prompt required"})

        gen_args: Dict[str, Any] = {
            "model":  MODEL,
            "prompt": prompt,
            "size":   SIZE,
            "n":      1,
        }
        if ref_id:
            gen_args["reference_image_id"] = ref_id

        log.info("Calling OpenAI images.generate with %s", gen_args)

        img: ImagesResponse = client.images.generate(**gen_args)
        url: str = img.data[0].url
        return _response(200, {"url": url})

    except Exception as exc:
        log.exception("image‑gen failed: %s", exc)
        return _response(500, {"error": str(exc)})