from botocore.exceptions import ClientError
from boto3.dynamodb.types import TypeSerializer, TypeDeserializer
from config import DES
from .tables import ddb, T_WREST
from http_utils import _log

WRES_PK = None

def _get_wrestler_pk():
    global WRES_PK
    if WRES_PK is not None:
        return WRES_PK
    try:
        desc = ddb.meta.client.describe_table(TableName=T_WREST.name)
        WRES_PK = [k["AttributeName"] for k in desc["Table"]["KeySchema"]]
    except Exception as e:
        WRES_PK = ["userId"]
        _log("WARN describe_table failed; defaulting wrestler PK", str(e))
    return WRES_PK

def _batch_get_wrestlers(ids, proj, ean):
    client = ddb.meta.client
    items = []
    req2 = {
        T_WREST.name: {
            "Keys": [{"userId": {"S": uid}, "role": {"S": "Wrestler"}} for uid in ids],
            "ProjectionExpression": proj,
            "ExpressionAttributeNames": ean,
            "ConsistentRead": False,
        }
    }
    try:
        resp = client.batch_get_item(RequestItems=req2)
        items += resp.get("Responses", {}).get(T_WREST.name, [])
        tries = 0
        while resp.get("UnprocessedKeys") and tries < 3:
            resp = client.batch_get_item(RequestItems=resp["UnprocessedKeys"])
            items += resp.get("Responses", {}).get(T_WREST.name, [])
            tries += 1
        if items:
            return items
    except Exception as e:
        _log("batch_get 2-key failed, trying 1-key", str(e))
    req1 = {
        T_WREST.name: {
            "Keys": [{"userId": {"S": uid}} for uid in ids],
            "ProjectionExpression": proj,
            "ExpressionAttributeNames": ean,
            "ConsistentRead": False,
        }
    }
    resp = client.batch_get_item(RequestItems=req1)
    items += resp.get("Responses", {}).get(T_WREST.name, [])
    tries = 0
    while resp.get("UnprocessedKeys") and tries < 3:
        resp = client.batch_get_item(RequestItems=resp["UnprocessedKeys"])
        items += resp.get("Responses", {}).get(T_WREST.name, [])
        tries += 1
    return items
