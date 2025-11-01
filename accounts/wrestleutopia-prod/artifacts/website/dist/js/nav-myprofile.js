import { apiFetch } from "/js/api.js";
import { getAuthState, isWrestler, isPromoter } from "/js/roles.js";

const FALLBACK_URL = "/profile.html";
const RESOLVE_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_KEY = "wu.myprofile.url.v1";

const isProd = !!(import.meta?.env?.PROD);
const buildId = (import.meta?.env?.VITE_BUILD_ID ?? "dev").toString();

const HANDLE_RE = /^[a-zA-Z0-9-_]{3,64}$/;

const ALLOWED_PATHS = new Set([
  "/profile.html",
  "/w",
  "/p",
  "/w/",
  "/p/",
  "/dashboard_wrestler.html",
  "/dashboard_promoter.html",
]);

const HASH_RE = /^#[a-zA-Z0-9._~%-]{0,200}$/;

let lastFailureTs = 0;
const FAILURE_BACKOFF_MS = 15_000;

let inflight = null;
let lastErrAt = 0;
const FAIL_RETRY_MS = 10_000;

function now() {
  return Date.now();
}

function normalizeHandle(h) {
  if (typeof h !== "string") return null;
  if (!HANDLE_RE.test(h)) return null;
  return h;
}

function toHashUrl(kind, slug) {
  if (!slug) return "#";
  return `/${kind}/#${encodeURIComponent(slug)}`;
}

function readCache(currentSub) {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (typeof obj?.url !== "string" || typeof obj?.t !== "number") return null;
    if (now() - obj.t > CACHE_TTL_MS) return null;
    if (currentSub && obj.sub && obj.sub !== currentSub) return null;
    return obj.url;
  } catch {
    return null;
  }
}

function writeCache(url, sub) {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ url, t: now(), b: buildId, sub: sub || null })
    );
  } catch {
  }
}

function clearCache() {
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
  }
}

function beacon(kind, payload) {
  if (!isProd) return;
  try {
    const body = JSON.stringify({
      kind,
      build: buildId,
      ts: now(),
      ...payload,
    });
    const ok = navigator.sendBeacon?.(
      "/telemetry",
      new Blob([body], { type: "application/json" })
    );
    if (!ok) {
      fetch("/telemetry", {
        method: "POST",
        mode: "no-cors",
        keepalive: true,
        body,
      });
    }
  } catch {
  }
}

async function withTimeout(promise, ms, label) {
  let id;
  const t = new Promise((_, rej) => {
    id = setTimeout(() => rej(new Error(label || "timeout")), ms);
  });
  try {
    return await Promise.race([promise, t]);
  } finally {
    clearTimeout(id);
  }
}

function safeSetHref(a, url) {
  try {
    const u = new URL(url, location.origin);

    if (u.origin !== location.origin) {
      a.setAttribute("href", FALLBACK_URL);
      return;
    }

    let pathname = u.pathname;
    if (pathname.endsWith("/") && pathname.length > 1) {
      pathname = pathname.slice(0, -1);
    }

    if (!ALLOWED_PATHS.has(u.pathname) && !ALLOWED_PATHS.has(pathname)) {
      a.setAttribute("href", FALLBACK_URL);
      return;
    }

    const hash = u.hash && HASH_RE.test(u.hash) ? u.hash : "";
    a.setAttribute("href", u.pathname + hash);
  } catch {
    a.setAttribute("href", FALLBACK_URL);
  }
}

async function resolveMyProfileUrl() {
  const state = await withTimeout(
    getAuthState(),
    RESOLVE_TIMEOUT_MS,
    "auth state timeout"
  ).catch(() => null);

  if (!state) {
    return "#";
  }

  const cached = readCache(state.sub);
  if (cached) {
    return cached;
  }

  if (now() - lastFailureTs < FAILURE_BACKOFF_MS) {
    return "#";
  }

  try {
    if (isWrestler(state)) {
      const me = await withTimeout(
        apiFetch("/profiles/wrestlers/me"),
        RESOLVE_TIMEOUT_MS,
        "wrestler resolve timeout"
      );

      const wrestlerId =
        normalizeHandle(me?.handle) ||
        normalizeHandle(me?.slug) ||
        normalizeHandle(me?.id) ||
        normalizeHandle(me?.sub) ||
        normalizeHandle(state.sub);

      if (wrestlerId) {
        const url = toHashUrl("w", wrestlerId);
        writeCache(url, state.sub);
        return url;
      }

      return "/dashboard_wrestler.html";
    }

    if (isPromoter(state)) {
      const me = await withTimeout(
        apiFetch("/profiles/promoters/me"),
        RESOLVE_TIMEOUT_MS,
        "promoter resolve timeout"
      );
      const id =
        normalizeHandle(me?.handle) ||
        normalizeHandle(me?.id) ||
        normalizeHandle(me?.sub) ||
        normalizeHandle(state.sub);

      if (id) {
        const url = toHashUrl("p", id);
        writeCache(url, state.sub);
        return url;
      }

      return "/dashboard_promoter.html";
    }

    return "#";
  } catch (err) {
    lastFailureTs = now();
    beacon("myprofile_error", { msg: err.message || String(err) });
    return "#";
  }
}

async function singleFlightResolve() {
  const nowMs = now();
  if (nowMs - lastErrAt < FAIL_RETRY_MS) {
    return "#";
  }

  if (!inflight) {
    inflight = (async () => {
      try {
        return await resolveMyProfileUrl();
      } catch (err) {
        lastErrAt = now();
        return "#";
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

function getAllMyProfileLinks() {
  return Array.from(
    document.querySelectorAll(
      "#nav-my-profile, #my-profile-link, [data-myprofile]"
    )
  );
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
      if (a.__busy) {
        e.preventDefault();
        return;
      }
      a.__busy = true;
      a.setAttribute("aria-busy", "true");

      let url = "#";
      try {
        url = await singleFlightResolve();
      } catch {
      }

      const dest =
        url && url !== "#"
          ? url
          : a.getAttribute("data-fallback") || FALLBACK_URL;

      if (url === "#") {
        beacon("myprofile_unresolved", {
          reason: "no-url",
          href: a.getAttribute("href") || "",
        });
      }

      e.preventDefault();
      safeSetHref(a, dest);
      location.href = a.getAttribute("href") || dest;

      a.removeAttribute("aria-busy");
      a.__busy = false;
    };

    if (a.__myprofileHandler) {
      a.removeEventListener("click", a.__myprofileHandler);
    }
    a.addEventListener("click", handler, { passive: false });
    a.__myprofileHandler = handler;

    const warmup = async () => {
      try {
        const url = await singleFlightResolve();
        if (url && url !== "#") safeSetHref(a, url);
      } catch {
      }
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
  } catch {
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", upgradeMyProfileLinks, {
    once: true,
  });
} else {
  upgradeMyProfileLinks();
}

window.addEventListener("auth:changed", () => {
  clearCache();
  upgradeMyProfileLinks();
});

try {
  const raw =
    window.WU_USER || JSON.parse(localStorage.getItem("wuUser") || "null");
  const role = raw?.role;
  const handle = normalizeHandle(raw?.handle);

  const links = getAllMyProfileLinks();

  if (handle && (role === "promoter" || role === "wrestler")) {
    const optimistic =
      role === "promoter" ? toHashUrl("p", handle) : toHashUrl("w", handle);
    links.forEach((a) => safeSetHref(a, optimistic));
    writeCache(optimistic, null);
  } else {
    links.forEach((a) => {
      if (!a.getAttribute("href") || a.getAttribute("href") === "#") {
        safeSetHref(a, a.getAttribute("data-fallback") || FALLBACK_URL);
      }
    });
  }
} catch {
  // ignore
}
