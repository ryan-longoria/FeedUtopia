import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def fetch_post():
    return

def lambda_handler(event, context):
    
    post = fetch_post()
    if post:
        return {"status": "post_found", "post": post}
    return {"status": "no_post"}