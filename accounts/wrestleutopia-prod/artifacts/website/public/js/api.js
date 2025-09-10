// /js/api.js
import { fetchAuthSession } from '/js/auth-bridge.js';

async function idToken() {
  const s = await fetchAuthSession();
  return s?.tokens?.idToken?.toString();
}

export async function apiFetch(path, { method = "GET", body = null } = {}) {
  const token = await idToken();
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${window.WU_API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${txt || res.statusText}`);
  }
  return res.json();
}

export async function uploadToS3(filename, contentType, blob) {
  const p = await apiFetch(
    `/s3/presign?key=${encodeURIComponent(filename)}&contentType=${encodeURIComponent(contentType)}`
  );
  const put = await fetch(p.uploadUrl, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: blob
  });
  if (!put.ok) throw new Error(`S3 upload failed ${put.status}`);
  return `s3://${p.objectKey}`;
}

window.WU_API_READY = true;
