import os, json, boto3, datetime as dt
s3 = boto3.client("s3")
def lambda_handler(event, _ctx):
    objs = s3.list_objects_v2(Bucket=os.environ["BUCKET"], Prefix="kb/")
    items = []
    for o in objs.get("Contents", []):
        meta = s3.head_object(Bucket=os.environ["BUCKET"], Key=o["Key"])
        items.append({
            "key": o["Key"],
            "title": meta["Metadata"].get("title", "untitled"),
            "created": meta["LastModified"].isoformat()
        })
    return {"statusCode":200,"headers":{"Access-Control-Allow-Origin":"*"},"body":json.dumps(sorted(items,key=lambda i:i["created"],reverse=True))}
