import { fetchAuthSession } from '/js/auth-bridge.js';

function joinUrl(base, path) {
  if (!base) throw new Error('WU_API base URL missing');
  if (!path) return base;
  return base.replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');
}

async function authToken() {
  const s = await fetchAuthSession();
  return s?.tokens?.idToken?.toString()
      || s?.tokens?.accessToken?.toString()
      || '';
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
  const token = await authToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body != null) headers['content-type'] = 'application/json';

  const hasBody = body !== null && body !== undefined;
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

export async function uploadAvatar(file) {
  // Keep your POST-as-query approach if you like; Lambda reads the querystring.
  const presign = await apiFetch(
    `/profiles/wrestlers/me/photo-url?contentType=${encodeURIComponent(file.type || 'application/octet-stream')}`,
    { method: 'POST' }
  );

  const uploadUrl   = presign?.uploadUrl;
  const objectKey   = presign?.objectKey;
  const contentType = presign?.contentType || file.type || 'application/octet-stream';

  if (!uploadUrl || !objectKey) throw new Error('presign failed');

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      // MUST match what was signed:
      'Content-Type': contentType,
      'x-amz-server-side-encryption': 'AES256',
      // DO NOT send 'Cache-Control' here (we didn't sign it)
    },
    body: file,
  });

  if (!putRes.ok) {
    throw new Error(`S3 upload failed ${putRes.status}: ${await putRes.text().catch(()=>putRes.statusText)}`);
  }
  return objectKey;
}

export async function uploadToS3(filename, contentType, file) {
  const params = new URLSearchParams({
    key: filename || 'upload.bin',
    contentType: contentType || 'application/octet-stream',
  });

  const presign = await apiFetch(`/s3/presign?${params.toString()}`, { method: 'GET' });

  const uploadUrl   = presign?.uploadUrl || presign?.url || presign?.signedUrl;
  const objectKey   = presign?.objectKey || presign?.key;
  const signedCT    = presign?.contentType || contentType || 'application/octet-stream';

  if (!uploadUrl || !objectKey) {
    console.error('presign response:', presign);
    throw new Error('Failed to get presigned URL (missing uploadUrl/objectKey)');
  }

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      // MUST match what was signed:
      'Content-Type': signedCT,
      'x-amz-server-side-encryption': 'AES256',
    },
    body: file,
  });

  if (!putRes.ok) {
    const text = await putRes.text().catch(() => '');
    throw new Error(`S3 upload failed ${putRes.status}: ${text || putRes.statusText}`);
  }

  return objectKey;
}

export const api = {
  get: (p, params) => apiFetch(params ? `${p}${qs(params)}` : p, { method: 'GET' }),
  post: (p, body) => apiFetch(p, { method: 'POST', body }),
  put: (p, body) => apiFetch(p, { method: 'PUT', body }),
  patch: (p, body) => apiFetch(p, { method: 'PATCH', body }),
  delete: (p) => apiFetch(p, { method: 'DELETE' }),
};

window.WU_API_READY = true;
