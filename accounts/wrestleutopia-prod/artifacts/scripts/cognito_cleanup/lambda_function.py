import os
import boto3
from datetime import datetime, timezone, timedelta

USER_POOL_ID = os.environ["USER_POOL_ID"]
MAX_AGE_HOURS = int(os.environ.get("MAX_AGE_HOURS", "24"))

cognito = boto3.client("cognito-idp")

def lambda_handler(event, context):
    cutoff = datetime.now(timezone.utc) - timedelta(hours=MAX_AGE_HOURS)
    pagination_token = None
    deleted = 0

    while True:
        kwargs = {
            "UserPoolId": USER_POOL_ID,
            "Filter": 'status = "UNCONFIRMED"',
            "Limit": 60,
        }
        if pagination_token:
            kwargs["PaginationToken"] = pagination_token

        resp = cognito.list_users(**kwargs)
        for u in resp.get("Users", []):
            created = u.get("UserCreateDate")
            if created and created < cutoff:
                username = u["Username"]
                try:
                    cognito.admin_delete_user(UserPoolId=USER_POOL_ID, Username=username)
                    deleted += 1
                except Exception as e:
                    print(f"Failed to delete {username}: {e}")

        pagination_token = resp.get("PaginationToken")
        if not pagination_token:
            break

    print(f"Deleted {deleted} stale UNCONFIRMED users")
    return {"deleted": deleted}
