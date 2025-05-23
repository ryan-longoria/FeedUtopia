import os, json, boto3, openai, logging

openai.api_key = os.environ["OPENAI_API_KEY"]
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

sys_prompt = (
  "You are an assistant that writes high‑engagement Instagram titles, "
  "subtitle text for images, and a longer caption. "
  "Return markdown with two sections:\n\n"
  "### 🔥 Image Text Ideas\n"
  "- Title (NEWLINE) Subtitle\n\n"
  "### 📲 Caption\n\n"
  "Use dashes for bullet points. Optimise for emotion and the Instagram algorithm."
)

def lambda_handler(event, _ctx):
    body = json.loads(event["body"] or "{}")
    context = body.get("context", "").strip()
    if not context:
        return {"statusCode": 400, "body": "context required"}

    resp = openai.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": context},
        ],
        temperature=0.8,
        max_tokens=800,
    )

    answer = resp.choices[0].message.content
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"text": answer}),
    }
