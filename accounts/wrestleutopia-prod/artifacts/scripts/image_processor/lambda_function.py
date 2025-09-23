# lambda_function.py (image-processor)
import os, io, boto3
from PIL import Image

s3   = boto3.client("s3")
ddb  = boto3.resource("dynamodb").Table(os.environ["TABLE_NAME"])
CDN  = os.environ["CDN_BASE"]

def lambda_handler(event, ctx):
    for rec in event["Records"]:
        b = rec["s3"]["bucket"]["name"]
        k = rec["s3"]["object"]["key"]
        if not k.startswith("raw/"): continue
        o = s3.get_object(Bucket=b, Key=k)
        ctype = o["ContentType"]
        if not ctype.startswith("image/"):  # ignore videos here
            continue

        meta = {k.lower(): v for k, v in (o.get("Metadata") or {}).items()}
        pk, sk = meta.get("pk"), meta.get("sk")
        if not pk or not sk:
            # If FE forgot to send metadata, skip safely
            continue

        img = Image.open(io.BytesIO(o["Body"].read())).convert("RGB")
        variants = {}
        for w in (400, 1200):
            im2 = img.copy()
            im2.thumbnail((w, 10000))
            out_key = f"images/{sk.split('#',1)[1]}/w{w}.jpg"  # images/<mediaId>/w400.jpg
            buf = io.BytesIO(); im2.save(buf, "JPEG", quality=86)
            s3.put_object(Bucket=b, Key=out_key, Body=buf.getvalue(), ContentType="image/jpeg")
            variants[f"w{w}"] = f"{CDN}/{out_key}"

        ddb.update_item(
            Key={"PK": pk, "SK": sk},
            UpdateExpression="SET #s=:ready, variants.image=:v",
            ExpressionAttributeNames={"#s":"status"},
            ExpressionAttributeValues={":ready": "ready", ":v": variants}
        )
