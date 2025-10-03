import os
import re
from boto3.dynamodb.types import TypeSerializer, TypeDeserializer

AWS_REGION = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "us-east-2"
DEBUG_TRYOUTS = (os.environ.get("DEBUG_TRYOUTS") or "").strip().lower() in {"1", "true", "yes"}
UUID_PATH = re.compile(r"^/tryouts/[0-9a-fA-F-]{36}$")
HANDLE_RE = re.compile(r"[^a-z0-9]+")
MAX_BIO_LEN = 1500
MAX_GIMMICKS = 10
SER = TypeSerializer()
DES = TypeDeserializer()

# Env checks (fail fast)
TABLE_WRESTLERS = os.environ["TABLE_WRESTLERS"]
TABLE_PROMOTERS = os.environ["TABLE_PROMOTERS"]
TABLE_TRYOUTS   = os.environ["TABLE_TRYOUTS"]
TABLE_APPS      = os.environ["TABLE_APPS"]
TABLE_HANDLES   = os.environ["TABLE_HANDLES"]
