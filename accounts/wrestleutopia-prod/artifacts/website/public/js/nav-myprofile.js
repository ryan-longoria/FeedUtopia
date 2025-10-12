import { apiFetch } from "/js/api.js";
import { getAuthState, isWrestler, isPromoter } from "/js/roles.js";

const FALLBACK_URL = "/profile.html";
const RESOLVE_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000
const CACHE_KEY = "wu.myprofile.url.v1";

const isProd = !!(import.meta?.env?.PROD);
const buildId = (import.meta?.env?.VITE_BUILD_ID ?? "dev").toString();

function safeSetHref(a, url) {
  try {
    const u = new URL(url, location.origin);
    const ok =
      u.origin === location.origin &&
      (u.pathname === "/profile.html" ||
        /^\/(w|p)\/?$/.test(u.pathname) ||
        /^\/(w|p)\/$/.test(u.pathname));
    if (ok) a.setAttribute("href", u.pathname + (u.hash || ""));
    else a.setAttribute("href", FALLBACK_URL);
  } catch {
    a.setAttribute("href", FALLBACK_URL);
  }
}

function toHashUrl(kind, slug) {
  if (!slug) return "#";
  return `/${kind}/#${encodeURIComponent(slug)}`;
}

function now() { return Date.now(); }

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (typeof obj?.url !== "string" || typeof obj?.t !== "number") return null;
    if (now() - obj.t > CACHE_TTL_MS) return null;
    return obj.url;
  } catch { return null; }
}

function writeCache(url) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ url, t: now(), b: buildId })); } catch {}
}

function clearCache() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch {}
}

function beacon(kind, payload) {
  if (!isProd) return;
  try {
    const body = JSON.stringify({ kind, build: buildId, ts: now(), ...payload });
    const ok = navigator.sendBeacon?.("/telemetry", new Blob([body], { type: "application/json" }));
    if (!ok) fetch("/telemetry", { method: "POST", mode: "no-cors", keepalive: true, body });
  } catch {}
}

async function withTimeout(promise, ms, label) {
  let id;
  const t = new Promise((_, rej) => { id = setTimeout(() => rej(new Error(label || "timeout")), ms); });
  try { return await Promise.race([promise, t]); }
  finally { clearTimeout(id); }
}

async function resolveMyProfileUrl() {
  const cached = readCache();
  if (cached) return cached;

  const state = await withTimeout(getAuthState(), RESOLVE_TIMEOUT_MS, "auth state timeout").catch(() => null);
  if (!state) return "#";

  if (isWrestler(state)) {
    try {
      const me = await withTimeout(apiFetch("/profiles/wrestlers/me"), RESOLVE_TIMEOUT_MS, "wrestler resolve timeout");
      if (me?.handle) {
        const url = toHashUrl("w", me.handle);
        writeCache(url);
        return url;
      }
    } catch {}
    return "/dashboard_wrestler.html";
  }

  if (isPromoter(state)) {
    try {
      const me = await withTimeout(apiFetch("/profiles/promoters/me"), RESOLVE_TIMEOUT_MS, "promoter resolve timeout");
      const id = me?.handle || me?.id || me?.sub || state.sub;
      if (id) {
        const url = toHashUrl("p", id);
        writeCache(url);
        return url;
      }
    } catch {}
    if (state.sub) {
      const url = toHashUrl("p", state.sub);
      writeCache(url);
      return url;
    }
    return "/dashboard_promoter.html";
  }

  return "#";
}

function getAllMyProfileLinks() {
  return Array.from(document.querySelectorAll("#nav-my-profile, #my-profile-link, [data-myprofile]"));
}

let inflight = null;
async function singleFlightResolve() {
  if (!inflight) {
    inflight = (async () => {
      try { return await resolveMyProfileUrl(); }
      finally { inflight = null; }
    })();
  }
  return inflight;
}

async function upgradeMyProfileLinks() {
  const links = getAllMyProfileLinks();
  if (!links.length) return;

  for (const a of links) {
    if (!a.getAttribute("href") || a.getAttribute("href") === "#") {
      const fb = a.getAttribute("data-fallback") || FALLBACK_URL;
      safeSetHref(a, fb);
    }

    const handler = async (e) => {
      if (a.__busy) { e.preventDefault(); return; }
      a.__busy = true;
      a.setAttribute("aria-busy", "true");

      let url = "#";
      try { url = await singleFlightResolve(); } catch {}

      const dest = (url && url !== "#") ? url : (a.getAttribute("data-fallback") || FALLBACK_URL);

      if (url === "#") beacon("myprofile_unresolved", { reason: "no-url", href: a.getAttribute("href") || "" });

      e.preventDefault();
      safeSetHref(a, dest);
      location.href = a.getAttribute("href") || dest;

      a.removeAttribute("aria-busy");
      a.__busy = false;
    };

    a.removeEventListener("click", a.__myprofileHandler);
    a.addEventListener("click", handler, { passive: false });
    a.__myprofileHandler = handler;

    const warmup = async () => {
      try {
        const url = await singleFlightResolve();
        if (url && url !== "#") safeSetHref(a, url);
      } catch {}
      a.removeEventListener("mouseenter", warmup);
      a.removeEventListener("focus", warmup, true);
    };
    a.addEventListener("mouseenter", warmup, { once: true });
    a.addEventListener("focus", warmup, { once: true, capture: true });
  }

  try {
    const url = await singleFlightResolve();
    if (url && url !== "#") {
      links.forEach((a) => safeSetHref(a, url));
    }
  } catch {}
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", upgradeMyProfileLinks, { once: true });
} else {
  upgradeMyProfileLinks();
}
window.addEventListener("auth:changed", () => { clearCache(); upgradeMyProfileLinks(); });

try {
  const cached = window.WU_USER || JSON.parse(localStorage.getItem("wuUser") || "null");
  if (cached?.handle) {
    const optimistic = cached.role === "promoter" ? toHashUrl("p", cached.handle) : toHashUrl("w", cached.handle);
    getAllMyProfileLinks().forEach((a) => safeSetHref(a, optimistic));
    writeCache(optimistic);
  } else {
    getAllMyProfileLinks().forEach((a) => {
      if (!a.getAttribute("href") || a.getAttribute("href") === "#") {
        safeSetHref(a, a.getAttribute("data-fallback") || FALLBACK_URL);
      }
    });
  }
} catch {}