const BASE = (window.WU_MEDIA_BASE || "").replace(/\/+$/, "");
function mediaUrl(key, fallback = "/assets/avatar-fallback.svg") {
  if (!key) return fallback;
  const k = String(key).trim();
  if (/^https?:\/\//i.test(k)) return k;
  if (!BASE) return k.replace(/^\/+/, "");
  return `${BASE}/${k.replace(/^\/+/, "")}`;
}
export {
  mediaUrl
};
