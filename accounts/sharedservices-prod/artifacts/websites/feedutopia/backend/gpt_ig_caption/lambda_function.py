import json, os, openai

openai.api_key = os.environ["OPENAI_API_KEY"]
MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1")

SYS_PROMPT = (
    "You are an assistant that writes high‑engagement Instagram titles, "
    "subtitle text for images, and a longer caption. "
    "Return markdown with two sections:\n\n"
    "### 🔥 Image Text Ideas (10 lines)\n"
    "- Title (NEWLINE) Subtitle\n\n"
    "### 📲 Caption\n\n"
    "Use dashes for bullet points. Optimise for emotion and the Instagram algorithm."
)

CORS = {
    "Access-Control-Allow-Origin":  "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Content-Type":                "application/json",
}

def lambda_handler(event, _ctx):
    try:
        if event.get("httpMethod") == "OPTIONS":
            return {"statusCode": 200, "headers": CORS, "body": ""}

        body     = json.loads(event.get("body") or "{}")
        context  = (body.get("context") or "").strip()
        if not context:
            raise ValueError("context required")

        resp = openai.chat.completions.create(
            model     = MODEL,
            messages  = [
                {"role": "system", "content": SYS_PROMPT},
                {"role": "user",   "content": context},
            ],
            temperature = 0.8,
            max_tokens  = 800,
        )

        return {
            "statusCode": 200,
            "headers": CORS,
            "body": json.dumps({"text": resp.choices[0].message.content}),
        }

    except Exception as exc:
        # Log to CloudWatch
        print("ERROR:", exc)
        return {
            "statusCode": 500,
            "headers": CORS,
            "body": json.dumps({"error": str(exc)}),
        }
