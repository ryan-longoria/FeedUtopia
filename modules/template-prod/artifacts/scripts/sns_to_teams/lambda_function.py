import os
import json
import urllib3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

http = urllib3.PoolManager()

def lambda_handler(event, context):
    teams_webhook_url = os.environ['TEAMS_WEBHOOK_URL']
    
    for record in event['Records']:
        sns_message = record['Sns']['Message']

        body = {
            "text": f"A CloudWatch Alarm has triggered:\n\n{sns_message}"
        }

        encoded_body = json.dumps(body).encode('utf-8')
        resp = http.request(
            "POST",
            teams_webhook_url,
            body=encoded_body,
            headers={'Content-Type': 'application/json'}
        )
        
        logger.info(f"Teams responded with status {resp.status}")
        
        if not 200 <= resp.status < 300:
            logger.error(f"Error posting to Teams: {resp.status}, {resp.data}")
            raise Exception(f"Failed to post message to Teams: {resp.status}")