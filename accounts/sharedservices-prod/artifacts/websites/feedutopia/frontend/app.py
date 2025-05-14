from types import ModuleType
import json

try:
    import js  # type: ignore
    import pyodide_http  # type: ignore
except ImportError:
    js = ModuleType("js")
    pyodide_http = ModuleType("pyodide_http")

pyodide_http.patch_all()

API_ROOT = f"{js.window.location.origin}/api"
OUT_EL = js.document.getElementById("out")


def log(message: str) -> None:
    """Append *message* to the `<pre id="out">` element."""
    OUT_EL.textContent += f"{message}\n"


async def handle_submit(event):
    """Click‑handler: upload file, then post metadata to FeedUtopia."""
    event.preventDefault()

    file_obj = js.document.getElementById("file").files[0]
    if not file_obj:
        log("Please choose a file first.")
        return

    media_type = js.document.getElementById("bgType").value

    resp = await js.fetch(
        f"{API_ROOT}/upload-url",
        method="POST",
        body=json.dumps({"mediaType": media_type}),
        headers={"Content-Type": "application/json"},
    )
    info = await resp.json()
    upload_url, key = info["url"], info["key"]

    log("Uploading to S3 …")
    await js.fetch(upload_url, method="PUT", body=file_obj)

    payload = {
        "accountName": js.document.getElementById("account").value,
        "title": js.document.getElementById("title").value,
        "description": js.document.getElementById("subtitle").value,
        "highlightWordsTitle": js.document.getElementById(
            "hlTitle"
        ).value,
        "highlightWordsDescription": js.document.getElementById(
            "hlSub"
        ).value,
        "backgroundType": media_type,
        "spinningArtifact": js.document.getElementById(
            "artifact"
        ).value,
        "key": key,
    }

    log("Calling FeedUtopia …")
    submit = await js.fetch(
        f"{API_ROOT}/submit",
        method="POST",
        headers={"Content-Type": "application/json"},
        body=json.dumps(payload),
    )
    log(await submit.text())


js.document.getElementById("submit").addEventListener(
    "click",
    handle_submit,
)

