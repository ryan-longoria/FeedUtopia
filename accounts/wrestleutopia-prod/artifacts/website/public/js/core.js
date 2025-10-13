const BUILD_ID = (import.meta?.env?.VITE_BUILD_ID ?? import.meta?.env?.VITE_COMMIT ?? "dev").toString();

function readDebugFlag() {
  if (!import.meta.env.PROD) {
    const url = new URL(location.href);
    if (url.searchParams.get("debug") === "1") return true;
    try { if (localStorage.getItem("WU_DEBUG") === "true") return true; } catch {}
  }
  try { if (window.WU_DEBUG === true) return true; } catch {}
  return false;
}
const WU_DEBUG = readDebugFlag();

let LOG_COUNT = 0, LOG_WINDOW_TS = performance.now();
function logAllowed() {
  const now = performance.now();
  if (now - LOG_WINDOW_TS > 5000) { LOG_WINDOW_TS = now; LOG_COUNT = 0; }
  return LOG_COUNT++ < 200;
}
const log = {
  d: (...a) => { if (WU_DEBUG && logAllowed()) console.debug("[WU]", ...a); },
  w: (...a) => { if (logAllowed()) console.warn("[WU]", ...a); },
  e: (...a) => { if (logAllowed()) console.error("[WU]", ...a); },
};

const RAW_MODULES = import.meta.glob("./**/*.js");
const MODULES = Object.fromEntries(
  Object.entries(RAW_MODULES).map(([k, loader]) => ["/js/" + k.replace(/^\.\//, ""), loader]),
);
Object.freeze(MODULES);
log.d("[core] discovered modules:", Object.keys(MODULES));

import "./config.js";
const BOOT = Object.freeze([
  "/js/auth-bridge.js",
  "/js/api.js",
  "/js/forms.js",
  "/js/roles.js",
  "/js/include.js",
  "/js/nav-myprofile.js",
  "/js/auth-modal.js",
  "/js/auth-modal-boot.js",
]);

function getPageId() {
  const meta = document.querySelector('meta[name="wu-page"]');
  const metaVal = meta?.content?.trim();
  if (metaVal && ROUTE_KEYS.has(metaVal)) return metaVal;

  const p = location.pathname.replace(/\/+$/, "");
  if (p === "/" || p === "/index.html") return "index";
  if (/\/w(?:\/index\.html)?$/.test(p)) return "w_index";
  if (/\/p(?:\/index\.html)?$/.test(p)) return "p_index";
  if (/\/promoter(?:\/index\.html)?$/.test(p)) return "promoter_index";
  const file = p.split("/").pop() || "";
  const id = file.replace(/\.html$/i, "");
  return ROUTE_KEYS.has(id) ? id : "index";
}

const ROUTES = Object.freeze({
  index: [
    "/js/main.js",
    "/js/home-redirect.js",
    "/js/home-free-offer-hide.js",
    "/js/home-tryouts-locked.js",
    "/js/home-auth-cta.js",
  ],
  privacy: [],
  terms: [],
  tryouts: ["/js/main.js"],

  profile: ["/js/profile_me.js", "/js/profile-preview-modal.js"],

  talent: ["/js/talent-lock.js", "/js/talent-modal.js", "/js/home-auth-cta.js"],

  dashboard_wrestler: [
    "/js/dashboard_wrestler.js",
    "/js/wrestler-guard-and-progress.js",
  ],

  dashboard_promoter: [
    "/js/dashboard_promoter_mytryouts.js",
    "/js/dashboard_promoter_apps.js",
    "/js/promoter-guard.js",
    "/js/promoter-apps-modal.js",
  ],

  w_index: ["/js/wrestler_public.js"],
  p_index: ["/js/promo_public.js"],
  promoter_index: ["/js/promo_me.js"],
});
const ROUTE_KEYS = new Set(Object.keys(ROUTES));

const loadedModules = new Set();

function sendTelemetry(kind, payload) {
  try {
    const body = JSON.stringify({
      kind,
      build: BUILD_ID,
      page: document.querySelector('meta[name="wu-page"]')?.content || getPageId(),
      ts: Date.now(),
      ...payload,
    });
  } catch {}
}

function timeout(ms, label = "timeout") {
  return new Promise((_, rej) => setTimeout(() => rej(new Error(label)), ms));
}

async function loadModulesSerial(paths = []) {
  for (const p of paths) {
    const loader = MODULES[p];
    if (!loader) { log.w("[core] no module registered for", p); continue; }
    try {
      const mod = await Promise.race([ loader(), timeout(12_000, `load ${p} timed out`) ]);
      loadedModules.add(p);
      log.d("[core] loaded", p, mod ? Object.keys(mod) : "");
    } catch (err) {
      log.e("[core] failed to load module:", p, err?.message || err);
      sendTelemetry("module_error", { mod: p, err: String(err) });
    }
  }
}

async function loadModulesParallel(paths = []) {
  const jobs = paths.map((p) => {
    const loader = MODULES[p];
    if (!loader) return Promise.resolve({ p, ok: false, err: "no module registered" });
    return Promise.race([ loader(), timeout(12_000, `load ${p} timed out`) ])
      .then((mod) => ({ p, ok: true, mod }))
      .catch((err) => ({ p, ok: false, err }));
  });

  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    const { p, ok, mod, err } = r.status === "fulfilled" ? r.value : { p: "unknown", ok: false, err: r.reason };
    if (ok) {
      loadedModules.add(p);
      log.d("[core] loaded", p, mod ? Object.keys(mod) : "");
    } else {
      log.e("[core] failed to load page module:", p, err?.message || err);
      sendTelemetry("module_error", { mod: p, err: String(err) });
    }
  }
}

window.addEventListener("error", (e) => {
  sendTelemetry("window_error", { msg: String(e.message || e.error), src: e.filename, ln: e.lineno, col: e.colno });
});
window.addEventListener("unhandledrejection", (e) => {
  sendTelemetry("unhandled_rejection", { reason: String(e.reason) });
});
window.addEventListener("securitypolicyviolation", (e) => {
  sendTelemetry("csp_violation", { violated: e.violatedDirective, blocked: e.blockedURI, line: e.lineNumber });
});

(async () => {
  performance.mark("boot:start");
  log.d("[core] page boot starting", { build: BUILD_ID });

  if (WU_DEBUG) {
    for (const [page, paths] of Object.entries(ROUTES)) {
      for (const p of paths) {
        if (!MODULES[p]) log.w(`[core] route "${page}" references missing module:`, p);
      }
    }
  }

  await loadModulesSerial([
    "/js/config.js",
    ...BOOT,
  ]);
  performance.mark("boot:afterBoot");
  performance.measure("boot:bootModules", "boot:start", "boot:afterBoot");

  const page = getPageId();
  const toLoad = ROUTES[page] || [];
  log.d("[core] page:", page, "modules:", toLoad);

  if (toLoad.length) {
    await loadModulesParallel(toLoad);
  } else {
    log.d("[core] no route for page:", page);
  }

  performance.mark("boot:end");
  performance.measure("boot:total", "boot:start", "boot:end");

  if (Math.random() < 0.01) {
    const m = performance.getEntriesByType("measure")
      .reduce((acc, x) => (acc[x.name] = Math.round(x.duration), acc), {});
    sendTelemetry("perf", m);
  }
})();
