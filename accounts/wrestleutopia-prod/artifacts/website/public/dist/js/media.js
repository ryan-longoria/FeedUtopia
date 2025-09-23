const MEDIA_BASE = window.WU_MEDIA_BASE || "";
export function mediaUrl(key, fallback='/assets/avatar-fallback.svg') {
  if (!key) return fallback;                     // nothing stored yet
  if (!MEDIA_BASE) return fallback;              // base not configured
  return `${MEDIA_BASE}/${key}`;                 // e.g. https://cdn.../user/..../file.png
}
