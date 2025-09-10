import { fetchAuthSession } from '/js/auth-bridge.js';

function joinUrl(base, path) {
  if (!base) throw new Error('WU_API base URL missing');
  if (!path) return base;
  return base.replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');
}

async function idToken() {
  const s = await fetchAuthSession();
  return s?.tokens?.idToken?.toString() || '';
}

export function qs(params = {}) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach(x => u.append(k, x));
    else u.set(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

export async function apiFetch(path, { method = 'GET', body = null } = {}) {
  const token = await idToken();
  const headers = {};

  if (token) headers.authorization = `Bearer ${token}`;

  const hasBody = body != null;
  if (hasBody) headers['content-type'] = 'application/json';

  const res = await fetch(joinUrl(window.WU_API, path), {
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : null,
  });

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const t = await res.text();
      if (t) {
        try { msg = JSON.parse(t).message || t; }
        catch { msg = t; }
      }
    } catch {}
    throw new Error(`API ${res.status}: ${msg}`);
  }

  if (res.status === 204 || res.status === 205 || res.status === 304) return null;
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    const txt = await res.text().catch(() => '');
    return txt || null;
  }
  return res.json();
}

export async function uploadToS3(filename, contentType, blob) {
  const ct = contentType || (blob && blob.type) || 'application/octet-stream';
  const presign = await apiFetch(
    `/s3/presign${qs({ key: filename, contentType: ct })}`
  );
  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': ct },
    body: blob,
  });
  if (!put.ok) {
    const t = await put.text().catch(() => '');
    throw new Error(`S3 upload failed ${put.status}${t ? `: ${t}` : ''}`);
  }
  return `s3://${presign.objectKey}`;
}

export const api = {
  get: (p, params) => apiFetch(params ? `${p}${qs(params)}` : p, { method: 'GET' }),
  post: (p, body) => apiFetch(p, { method: 'POST', body }),
  put: (p, body) => apiFetch(p, { method: 'PUT', body }),
  patch: (p, body) => apiFetch(p, { method: 'PATCH', body }),
  delete: (p) => apiFetch(p, { method: 'DELETE' }),
};

window.WU_API_READY = true;
