from __future__ import annotations

import json
import os
from typing import Any, Dict

from openai import OpenAI

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
MODEL          = "gpt-image-1"
SIZE           = "1080x1920"

client = OpenAI(api_key=OPENAI_API_KEY)

HEADERS: Dict[str, str] = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key",
    "Content-Type":                 "application/json",
}


def _response(status: int, body: Any) -> Dict[str, Any]:
    """Helper to build a proxy‑integration response."""
    return {
        "statusCode": status,
        "headers": HEADERS,
        "body": json.dumps(body),
    }


def lambda_handler(event, _ctx):
    """Entrypoint for API Gateway (Lambda proxy integration)."""
    if event.get("httpMethod") == "OPTIONS":
        return _response(200, {})

    try:
        body = json.loads(event.get("body") or "{}")
        prompt: str | None       = body.get("prompt")
        ref_image_id: str | None = body.get("refImageId")

        if not prompt:
            return _response(400, {"error": "prompt required"})

        images = client.images.generate(
            prompt=prompt,
            size=SIZE,
            n=1,
            reference_image_id=ref_image_id,
        )
        url: str = images.data[0].url
        return _response(200, {"url": url})

    except Exception as exc:
        return _response(500, {"error": str(exc)})
