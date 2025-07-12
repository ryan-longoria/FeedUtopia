from __future__ import annotations

import io
import json
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, List

import boto3
import requests
from PIL import Image, ImageDraw, ImageFont, ImageOps

DDB = boto3.resource("dynamodb")
S3  = boto3.client("s3")

TABLE        = DDB.Table(os.environ["NEWS_TABLE"])
BUCKET       = os.environ["TARGET_BUCKET"]
TEAMS_CONFIG = json.loads(os.environ["TEAMS_JSON"])

WIDTH, HEIGHT = 1080, 1350
TITLE_FONT    = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 80)
SUB_FONT      = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",       58)
PINK          = "#ec008c"

def fetch_records(account: str) -> List[Dict]:
    """Return un‑processed items from the last 7 days."""
    week_ago = int((datetime.now(timezone.utc) - timedelta(days=7)).timestamp())

    resp = TABLE.query(
        KeyConditionExpression="accountName = :acct AND createdAt >= :start",
        ExpressionAttributeValues={":acct": account, ":start": week_ago},
    )
    return resp["Items"]


def mark_done(item: Dict) -> None:
    """Delete the record – TTL would also remove it eventually."""
    TABLE.delete_item(
        Key={
            "accountName": item["accountName"],
            "createdAt":   item["createdAt"],
        }
    )


def text_wrap(draw: ImageDraw.Draw, text: str, font: ImageFont.FreeTypeFont, max_w: int) -> List[str]:
    """Split text into lines that fit `max_w`."""
    words, lines, cur = text.split(), [], ""
    for w in words:
        test = f"{cur} {w}".strip()
        if draw.textlength(test, font=font) <= max_w:
            cur = test
        else:
            lines.append(cur)
            cur = w
    lines.append(cur)
    return lines


def build_image(bg_bytes: bytes, title: str, subtitle: str) -> bytes:
    """Return JPEG bytes (1080×1350) with overlaid text."""
    bg = Image.open(io.BytesIO(bg_bytes)).convert("RGB")
    bg = ImageOps.fit(bg, (WIDTH, HEIGHT), Image.LANCZOS)

    gradient = Image.new("L", (1, HEIGHT), color=0xFF)
    for y in range(HEIGHT):
        gradient.putpixel((0, y), int(150 * (y / HEIGHT)))
    alpha = gradient.resize(bg.size)
    black = Image.new("RGBA", bg.size, color="black")
    bg = Image.composite(bg, black, alpha).convert("RGB")

    draw = ImageDraw.Draw(bg)
    margin = 80
    max_w  = WIDTH - 2 * margin

    y = 200
    for line in text_wrap(draw, title.upper(), TITLE_FONT, max_w):
        draw.text((margin, y), line, font=TITLE_FONT, fill=PINK)
        y += TITLE_FONT.size + 10

    if subtitle:
        y += 40
        for line in text_wrap(draw, subtitle.upper(), SUB_FONT, max_w):
            draw.text((margin, y), line, font=SUB_FONT, fill="white")
            y += SUB_FONT.size + 8

    out = io.BytesIO()
    bg.save(out, format="JPEG", quality=90)
    return out.getvalue()


def s3_bytes(bucket: str, key: str) -> bytes:
    resp = S3.get_object(Bucket=bucket, Key=key)
    return resp["Body"].read()


def upload_and_url(data: bytes, key: str, expires: int = 604800) -> str:
    S3.put_object(Bucket=BUCKET, Key=key, Body=data, ContentType="image/jpeg")
    return S3.generate_presigned_url(
        "get_object",
        Params={"Bucket": BUCKET, "Key": key},
        ExpiresIn=expires,
    )


def send_to_teams(account: str, img_url: str) -> None:
    webhook = TEAMS_CONFIG[account]["manual"]
    card = {
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        "summary": "Weekly recap image",
        "sections": [
            {
                "activityTitle": f"Weekly recap – {account}",
                "images": [{"image": img_url}],
            }
        ],
    }
    resp = requests.post(webhook, headers={"Content-Type": "application/json"}, json=card, timeout=15)
    resp.raise_for_status()


def lambda_handler(event, context):
    """Entry‑point."""
    now = datetime.now(timezone.utc)
    week_tag = now.strftime("week-%Y%m%d")

    for account in TEAMS_CONFIG.keys():
        for item in fetch_records(account):
            try:
                bg_bytes = s3_bytes(item["s3Bucket"], item["s3Key"])
                img      = build_image(bg_bytes, item["title"], item["subtitle"])
                key      = f"recaps/{account}/{week_tag}/{int(time.time())}.jpg"
                url      = upload_and_url(img, key)

                send_to_teams(account, url)
                mark_done(item)
            except Exception as exc:
                print(f"[WARN] Failed recap for {account}: {exc}")

    return {"status": "ok"}