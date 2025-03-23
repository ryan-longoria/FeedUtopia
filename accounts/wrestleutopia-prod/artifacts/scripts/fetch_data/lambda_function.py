import uuid
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def fetch_post() -> Optional[Dict[str, str]]:
    """
    Fetch a post from a data source.

    Returns:
        A dictionary containing the post title and body if found,
        otherwise None.
    """
    post = {"title": "Example Title", "body": "Post body data..."}
    return post


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    AWS Lambda handler function that retrieves a post and returns it,
    assigning a generated post ID if one is not supplied.

    Args:
        event: A dictionary containing the input data (e.g., 'post_id').
        context: The Lambda context object (not used here, but included
            because AWS Lambda provides it).

    Returns:
        A dictionary containing:
            - "status": A status message indicating whether a post was found.
            - "post_id": The provided or generated post ID.
            - "post": The post data, if found.
    """
    post_id = event.get("post_id", str(uuid.uuid4()))
    post = fetch_post()

    if post:
        logger.info("Found post, assigning post_id = %s", post_id)
        return {
            "status": "post_found",
            "post_id": post_id,
            "post": post
        }

    logger.info("No post found")
    return {
        "status": "no_post"
    }
