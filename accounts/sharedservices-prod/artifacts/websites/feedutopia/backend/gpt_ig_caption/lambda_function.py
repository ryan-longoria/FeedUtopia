import json, os, openai

openai.api_key = os.environ["OPENAI_API_KEY"]
MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1")

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type": "application/json",
}

def lambda_handler(event, _ctx):
    try:
        body = json.loads(event.get("body") or "{}")
        context = body.get("context", "").strip()
        if not context:
            raise ValueError("context required")

        resp = openai.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": "You write IG titles & captions."},
                {"role": "user", "content": context},
            ],
            temperature=0.8,
            max_tokens=800,
        )

        return {
            "statusCode": 200,
            "headers": CORS,
            "body": json.dumps({"text": resp.choices[0].message.content}),
        }

    except Exception as e:
        # log for CW
        print("ERROR:", e)
        return {
            "statusCode": 500,
            "headers": CORS,
            "body": json.dumps({"error": str(e)}),
        }
