const RAW_BASE = (window.WU_MEDIA_BASE || "").trim();

const ALLOWED_ORIGINS = [
  window.location.origin,
  "https://d178p8k1vmj1zs.cloudfront.net",
];

const BASE = (() => {
  if (!RAW_BASE) return "";
  try {
    const url = new URL(RAW_BASE, window.location.origin);

    if (!ALLOWED_ORIGINS.includes(url.origin)) {
      console.warn("WU_MEDIA_BASE origin not allowed, ignoring:", RAW_BASE);
      return "";
    }

    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch (err) {
    console.warn("Invalid WU_MEDIA_BASE, ignoring:", RAW_BASE);
    return "";
  }
})();

function isHttpUrl(s) {
  return /^https?:\/\//i.test(s);
}

function isProtocolRelative(s) {
  return /^\/\//.test(s);
}

function isDangerousScheme(s) {
  return /^(javascript|data|vbscript):/i.test(s);
}

export function mediaUrl(key, fallback = "/assets/avatar-fallback.svg") {
  if (!key) return fallback;

  const k = String(key).trim();

  if (isDangerousScheme(k) || isProtocolRelative(k)) {
    console.warn("Blocked unsafe media key:", k);
    return fallback;
  }

  if (isHttpUrl(k)) return k;

  const cleanKey = k.replace(/^\/+/, "");
  if (!cleanKey) return fallback;

  if (!BASE) return cleanKey;

  return `${BASE}/${cleanKey}`;
}
