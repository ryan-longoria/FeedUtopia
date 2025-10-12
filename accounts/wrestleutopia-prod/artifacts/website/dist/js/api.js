import "./auth-bridge.js";
import { fetchAuthSession } from "https://esm.sh/aws-amplify@6/auth";
import "https://esm.sh/aws-amplify@6";
import "https://esm.sh/aws-amplify@6/utils";
function resolveApiBase() {
  var _a;
  if (typeof window !== "undefined" && window.WU_API) return window.WU_API;
  if (typeof window !== "undefined" && ((_a = window.__CONFIG) == null ? void 0 : _a.WU_API)) {
    return window.__CONFIG.WU_API;
  }
  if (typeof document !== "undefined") {
    const meta = document.querySelector('meta[name="wu-api"]');
    if (meta == null ? void 0 : meta.content) return meta.content;
  }
  return "";
}
let __API_BASE = "";
function getApiBase(strict = false) {
  if (!__API_BASE) __API_BASE = resolveApiBase();
  if (!__API_BASE && strict) throw new Error("WU_API base URL missing");
  return __API_BASE;
}
function setApiBase(url) {
  __API_BASE = url || "";
}
function joinUrl(...parts) {
  const filtered = parts.filter(Boolean).map((p) => String(p));
  if (filtered.length === 0) return "";
  let out = filtered[0];
  for (let i = 1; i < filtered.length; i++) {
    const seg = filtered[i];
    out = out.replace(/\/+$/, "") + "/" + seg.replace(/^\/+/, "");
  }
  return out.replace(/([^:]\/)\/+/g, "$1");
}
async function authToken() {
  var _a, _b, _c, _d;
  const s = await fetchAuthSession();
  return ((_b = (_a = s == null ? void 0 : s.tokens) == null ? void 0 : _a.idToken) == null ? void 0 : _b.toString()) || ((_d = (_c = s == null ? void 0 : s.tokens) == null ? void 0 : _c.accessToken) == null ? void 0 : _d.toString()) || "";
}
async function md5Base64(blob) {
  if (!window.SparkMD5) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/spark-md5@3.0.2/spark-md5.min.js";
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const chunkSize = 2 * 1024 * 1024;
  const chunks = Math.ceil(blob.size / chunkSize);
  const spark = new window.SparkMD5.ArrayBuffer();
  for (let i = 0; i < chunks; i++) {
    const buf = await blob.slice(i * chunkSize, Math.min((i + 1) * chunkSize, blob.size)).arrayBuffer();
    spark.append(buf);
  }
  const hex = spark.end();
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
function qs(params = {}) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === void 0 || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, x));
    else u.set(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}
async function apiFetch(path, { method = "GET", body = null, headers: extraHeaders = {} } = {}) {
  const base = getApiBase(false);
  if (!base) {
    console.error("WU_API base URL missing");
    throw new Error("WU_API base URL missing");
  }
  const token = await authToken();
  const headers = { ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body != null) headers["content-type"] = "application/json";
  const hasBody = body !== null && body !== void 0;
  const url = joinUrl(base, path);
  const res = await fetch(url, {
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : null
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const t = await res.text();
      if (t) {
        try {
          msg = JSON.parse(t).message || t;
        } catch {
          msg = t;
        }
      }
    } catch {
    }
    throw new Error(`API ${res.status}: ${msg}`);
  }
  if (res.status === 204 || res.status === 205 || res.status === 304)
    return null;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const txt = await res.text().catch(() => "");
    return txt || null;
  }
  return res.json();
}
async function uploadAvatar(file) {
  const md5b64 = await md5Base64(file);
  const presign = await apiFetch(
    `/profiles/wrestlers/me/photo-url?contentType=${encodeURIComponent(
      file.type || "application/octet-stream"
    )}`,
    { method: "POST", headers: { "Content-MD5": md5b64 } }
  );
  const uploadUrl = presign == null ? void 0 : presign.uploadUrl;
  const objectKey = presign == null ? void 0 : presign.objectKey;
  const contentType = (presign == null ? void 0 : presign.contentType) || file.type || "application/octet-stream";
  if (!uploadUrl || !objectKey) throw new Error("presign failed");
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-server-side-encryption": "AES256",
      "Content-MD5": md5b64
    },
    body: file
  });
  if (!putRes.ok) {
    throw new Error(
      `S3 upload failed ${putRes.status}: ${await putRes.text().catch(() => putRes.statusText) || putRes.statusText}`
    );
  }
  return objectKey;
}
async function uploadToS3(filename, contentType, file, opts = {}) {
  const md5b64 = await md5Base64(file);
  const params = new URLSearchParams({
    key: filename || "upload.bin",
    contentType: contentType || "application/octet-stream"
  });
  if (opts.actor) params.set("actor", String(opts.actor));
  if (opts.type) params.set("type", String(opts.type));
  const presign = await apiFetch(`/s3/presign?${params.toString()}`, {
    method: "GET",
    headers: { "Content-MD5": md5b64 }
  });
  const uploadUrl = (presign == null ? void 0 : presign.uploadUrl) || (presign == null ? void 0 : presign.url) || (presign == null ? void 0 : presign.signedUrl);
  const objectKey = (presign == null ? void 0 : presign.objectKey) || (presign == null ? void 0 : presign.key);
  const signedCT = (presign == null ? void 0 : presign.contentType) || contentType || "application/octet-stream";
  if (!uploadUrl || !objectKey) {
    console.error("presign response:", presign);
    throw new Error("Failed to get presigned URL (missing uploadUrl/objectKey)");
  }
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": signedCT,
      "x-amz-server-side-encryption": "AES256",
      "Content-MD5": md5b64
    },
    body: file
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => "");
    throw new Error(`S3 upload failed ${putRes.status}: ${text || putRes.statusText}`);
  }
  return objectKey;
}
function asItems(x) {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.items)) return x.items;
  return [];
}
const api = {
  get: (p, params) => apiFetch(params ? `${p}${qs(params)}` : p, { method: "GET" }),
  post: (p, body) => apiFetch(p, { method: "POST", body }),
  put: (p, body) => apiFetch(p, { method: "PUT", body }),
  patch: (p, body) => apiFetch(p, { method: "PATCH", body }),
  delete: (p) => apiFetch(p, { method: "DELETE" })
};
window.WU_API_READY = true;
export {
  api,
  apiFetch,
  asItems,
  getApiBase,
  joinUrl,
  md5Base64,
  qs,
  setApiBase,
  uploadAvatar,
  uploadToS3
};
