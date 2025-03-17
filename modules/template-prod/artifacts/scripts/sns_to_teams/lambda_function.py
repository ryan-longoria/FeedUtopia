import os
import json
import urllib3

def lambda_handler(event, context):
    teams_webhook_url = os.environ['TEAMS_WEBHOOK_URL']
    http = urllib3.PoolManager()

    for record in event['Records']:
        sns_message = record['Sns']['Message']
        
        body = {
            "text": f"A CloudWatch Alarm has triggered:\n\n{sns_message}"
        }
        
        encoded_body = json.dumps(body).encode('utf-8')
        resp = http.request("POST", teams_webhook_url, 
                            body=encoded_body,
                            headers={'Content-Type': 'application/json'})
        print(f"Teams responded with status {resp.status}")
