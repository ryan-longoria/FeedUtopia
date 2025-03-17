import uuid
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def fetch_post():
    post = {"title": "Example Title", "body": "Post body data..."}
    return post

def lambda_handler(event, context):
    post_id = event.get("post_id") or str(uuid.uuid4())
    
    post = fetch_post()
    if post:
        logger.info(f"Found post, assigning post_id = {post_id}")
        return {
            "status": "post_found",
            "post_id": post_id,
            "post": post
        }
    else:
        logger.info("No post found")
        return {"status": "no_post"}