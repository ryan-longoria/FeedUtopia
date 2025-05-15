import os, json, boto3, traceback
s3 = boto3.client("s3")

def lambda_handler(event, _ctx):
    try:
        bucket = os.environ["BUCKET"]
        body   = json.loads(event.get("body") or "{}")
        key    = body.get("key")
        if not key:
            return {"statusCode":400}
        s3.delete_object(Bucket=bucket, Key=key)
        return {
          "statusCode": 200,
          "headers": { 
            "Access-Control-Allow-Origin":"*",
            "Access-Control-Allow-Methods":"DELETE,OPTIONS",
            "Access-Control-Allow-Headers":"Content-Type"
          },
          "body": json.dumps({"message":"deleted"})
        }
    except Exception:
        traceback.print_exc()
        return {"statusCode":500}
