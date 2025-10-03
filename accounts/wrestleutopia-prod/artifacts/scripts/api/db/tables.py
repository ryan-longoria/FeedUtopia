import boto3
from config import AWS_REGION, TABLE_WRESTLERS, TABLE_PROMOTERS, TABLE_TRYOUTS, TABLE_APPS, TABLE_HANDLES
from http_utils import _log

ddb = boto3.resource("dynamodb", region_name=AWS_REGION)
T_WREST = ddb.Table(TABLE_WRESTLERS)
T_PROMO = ddb.Table(TABLE_PROMOTERS)
T_TRY   = ddb.Table(TABLE_TRYOUTS)
T_APP   = ddb.Table(TABLE_APPS)
T_HANDLES = ddb.Table(TABLE_HANDLES)

_log("REGION", AWS_REGION, "TABLES", {
    "wrestlers": TABLE_WRESTLERS,
    "promoters": TABLE_PROMOTERS,
    "tryouts": TABLE_TRYOUTS,
    "apps": TABLE_APPS,
    "handles": TABLE_HANDLES,
})
