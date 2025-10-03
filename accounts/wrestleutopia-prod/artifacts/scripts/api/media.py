import datetime

def _normalize_media_key(raw: str, sub: str, actor: str, kind: str | None = None) -> str | None:
    if not raw:
        return None
    k = str(raw).strip()
    if k.startswith("s3://"):
        parts = k.split("/", 3)
        if len(parts) >= 4:
            k = parts[3]
        else:
            return None
    if k.startswith(("public/wrestlers/", "public/promoters/", "raw/uploads/")):
        return k
    if sub and k.startswith(f"profiles/{sub}/"):
        base = "wrestlers" if actor == "wrestler" else "promoters"
        tail = k.split(f"profiles/{sub}/", 1)[1]
        return f"public/{base}/profiles/{sub}/{tail}"
    if sub and k.startswith(f"user/{sub}/"):
        base = "wrestlers" if actor == "wrestler" else "promoters"
        tail = k.split(f"user/{sub}/", 1)[1]
        return f"public/{base}/gallery/{sub}/{tail}"
    if sub and k.startswith(f"{sub}/"):
        tail = k.split(f"{sub}/", 1)[1]
        return f"raw/uploads/{sub}/{tail}"
    fname = (k.rsplit("/", 1)[-1] or f"file-{int(datetime.datetime.utcnow().timestamp())}")
    return f"raw/uploads/{sub}/{fname}" if sub else None
