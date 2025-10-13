const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["js/api.js","js/auth-bridge.js","js/auth-modal.js","js/dashboard_promoter_apps.js","js/roles.js","js/dashboard_promoter_mytryouts.js","js/dashboard_wrestler2.js","js/forms.js","js/home-free-offer-hide.js","js/home-redirect.js","js/home-tryouts-locked.js","js/main.js","js/nav-myprofile.js","js/profile_me.js","js/media.js","js/promo_me.js","js/promo_public.js","js/promoter-guard.js","js/public_profile.js","js/talent-lock.js","js/wrestler-guard-and-progress.js","js/wrestler_public.js"])))=>i.map(i=>d[i]);
(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
const scriptRel = "modulepreload";
const assetsURL = function(dep) {
  return "/" + dep;
};
const seen = {};
const __vitePreload = function preload(baseModule, deps, importerUrl) {
  let promise = Promise.resolve();
  if (deps && deps.length > 0) {
    const links = document.getElementsByTagName("link");
    const cspNonceMeta = document.querySelector(
      "meta[property=csp-nonce]"
    );
    const cspNonce = (cspNonceMeta == null ? void 0 : cspNonceMeta.nonce) || (cspNonceMeta == null ? void 0 : cspNonceMeta.getAttribute("nonce"));
    promise = Promise.allSettled(
      deps.map((dep) => {
        dep = assetsURL(dep, importerUrl);
        if (dep in seen) return;
        seen[dep] = true;
        const isCss = dep.endsWith(".css");
        const cssSelector = isCss ? '[rel="stylesheet"]' : "";
        const isBaseRelative = !!importerUrl;
        if (isBaseRelative) {
          for (let i = links.length - 1; i >= 0; i--) {
            const link2 = links[i];
            if (link2.href === dep && (!isCss || link2.rel === "stylesheet")) {
              return;
            }
          }
        } else if (document.querySelector(`link[href="${dep}"]${cssSelector}`)) {
          return;
        }
        const link = document.createElement("link");
        link.rel = isCss ? "stylesheet" : scriptRel;
        if (!isCss) {
          link.as = "script";
        }
        link.crossOrigin = "";
        link.href = dep;
        if (cspNonce) {
          link.setAttribute("nonce", cspNonce);
        }
        document.head.appendChild(link);
        if (isCss) {
          return new Promise((res, rej) => {
            link.addEventListener("load", res);
            link.addEventListener(
              "error",
              () => rej(new Error(`Unable to preload CSS for ${dep}`))
            );
          });
        }
      })
    );
  }
  function handlePreloadError(err) {
    const e = new Event("vite:preloadError", {
      cancelable: true
    });
    e.payload = err;
    window.dispatchEvent(e);
    if (!e.defaultPrevented) {
      throw err;
    }
  }
  return promise.then((res) => {
    for (const item of res || []) {
      if (item.status !== "rejected") continue;
      handlePreloadError(item.reason);
    }
    return baseModule().catch(handlePreloadError);
  });
};
window.WU_API = "https://go2gft4394.execute-api.us-east-2.amazonaws.com";
window.WU_MEDIA_BASE = "https://d178p8k1vmj1zs.cloudfront.net";
const config = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null
}, Symbol.toStringTag, { value: "Module" }));
const __vite_import_meta_env__ = { "BASE_URL": "/", "DEV": false, "MODE": "production", "PROD": true, "SSR": false };
const BUILD_ID = ((__vite_import_meta_env__ == null ? void 0 : __vite_import_meta_env__.VITE_BUILD_ID) ?? (__vite_import_meta_env__ == null ? void 0 : __vite_import_meta_env__.VITE_COMMIT) ?? "dev").toString();
function readDebugFlag() {
  if (false) {
    const url = new URL(location.href);
    if (url.searchParams.get("debug") === "1") return true;
    try {
      if (localStorage.getItem("WU_DEBUG") === "true") return true;
    } catch {
    }
  }
  try {
    if (window.WU_DEBUG === true) return true;
  } catch {
  }
  return false;
}
const WU_DEBUG = readDebugFlag();
let LOG_COUNT = 0, LOG_WINDOW_TS = performance.now();
function logAllowed() {
  const now = performance.now();
  if (now - LOG_WINDOW_TS > 5e3) {
    LOG_WINDOW_TS = now;
    LOG_COUNT = 0;
  }
  return LOG_COUNT++ < 200;
}
const log = {
  d: (...a) => {
    if (WU_DEBUG && logAllowed()) console.debug("[WU]", ...a);
  },
  w: (...a) => {
    if (logAllowed()) console.warn("[WU]", ...a);
  },
  e: (...a) => {
    if (logAllowed()) console.error("[WU]", ...a);
  }
};
const RAW_MODULES = /* @__PURE__ */ Object.assign({ "./api.js": () => __vitePreload(() => import("./api.js"), true ? __vite__mapDeps([0,1]) : void 0), "./auth-bridge.js": () => __vitePreload(() => import("./auth-bridge.js"), true ? [] : void 0), "./auth-modal-boot.js": () => __vitePreload(() => import("./auth-modal-boot.js"), true ? [] : void 0), "./auth-modal.js": () => __vitePreload(() => import("./auth-modal.js"), true ? __vite__mapDeps([2,1]) : void 0), "./config.js": () => __vitePreload(() => Promise.resolve().then(() => config), true ? void 0 : void 0), "./dashboard_promoter_apps.js": () => __vitePreload(() => import("./dashboard_promoter_apps.js"), true ? __vite__mapDeps([3,0,1,4]) : void 0), "./dashboard_promoter_mytryouts.js": () => __vitePreload(() => import("./dashboard_promoter_mytryouts.js"), true ? __vite__mapDeps([5,0,1,4]) : void 0), "./dashboard_wrestler.js": () => __vitePreload(() => import("./dashboard_wrestler2.js"), true ? __vite__mapDeps([6,0,1,4]) : void 0), "./forms.js": () => __vitePreload(() => import("./forms.js"), true ? __vite__mapDeps([7,0,1,4]) : void 0), "./home-auth-cta.js": () => __vitePreload(() => import("./home-auth-cta.js"), true ? [] : void 0), "./home-free-offer-hide.js": () => __vitePreload(() => import("./home-free-offer-hide.js"), true ? __vite__mapDeps([8,4,1]) : void 0), "./home-redirect.js": () => __vitePreload(() => import("./home-redirect.js"), true ? __vite__mapDeps([9,4,1]) : void 0), "./home-tryouts-locked.js": () => __vitePreload(() => import("./home-tryouts-locked.js"), true ? __vite__mapDeps([10,4,1]) : void 0), "./include.js": () => __vitePreload(() => import("./include.js"), true ? [] : void 0), "./main.js": () => __vitePreload(() => import("./main.js"), true ? __vite__mapDeps([11,0,1]) : void 0), "./media.js": () => __vitePreload(() => import("./media.js"), true ? [] : void 0), "./nav-myprofile.js": () => __vitePreload(() => import("./nav-myprofile.js"), true ? __vite__mapDeps([12,0,1,4]) : void 0), "./profile-preview-modal.js": () => __vitePreload(() => import("./profile-preview-modal.js"), true ? [] : void 0), "./profile_me.js": () => __vitePreload(() => import("./profile_me.js"), true ? __vite__mapDeps([13,0,1,4,14]) : void 0), "./promo_me.js": () => __vitePreload(() => import("./promo_me.js"), true ? __vite__mapDeps([15,0,1,4,14]) : void 0), "./promo_public.js": () => __vitePreload(() => import("./promo_public.js"), true ? __vite__mapDeps([16,0,1,14]) : void 0), "./promoter-apps-modal.js": () => __vitePreload(() => import("./promoter-apps-modal.js"), true ? [] : void 0), "./promoter-guard.js": () => __vitePreload(() => import("./promoter-guard.js"), true ? __vite__mapDeps([17,4,1]) : void 0), "./public_profile.js": () => __vitePreload(() => import("./public_profile.js"), true ? __vite__mapDeps([18,0,1,14]) : void 0), "./roles.js": () => __vitePreload(() => import("./roles.js"), true ? __vite__mapDeps([4,1]) : void 0), "./talent-lock.js": () => __vitePreload(() => import("./talent-lock.js"), true ? __vite__mapDeps([19,4,1]) : void 0), "./talent-modal.js": () => __vitePreload(() => import("./talent-modal.js"), true ? [] : void 0), "./wrestler-guard-and-progress.js": () => __vitePreload(() => import("./wrestler-guard-and-progress.js"), true ? __vite__mapDeps([20,4,1]) : void 0), "./wrestler_public.js": () => __vitePreload(() => import("./wrestler_public.js"), true ? __vite__mapDeps([21,0,1,14]) : void 0) });
const MODULES = Object.fromEntries(
  Object.entries(RAW_MODULES).map(([k, loader]) => ["/js/" + k.replace(/^\.\//, ""), loader])
);
Object.freeze(MODULES);
log.d("[core] discovered modules:", Object.keys(MODULES));
const BOOT = Object.freeze([
  "/js/auth-bridge.js",
  "/js/api.js",
  "/js/forms.js",
  "/js/roles.js",
  "/js/include.js",
  "/js/nav-myprofile.js",
  "/js/auth-modal.js",
  "/js/auth-modal-boot.js"
]);
function getPageId() {
  var _a;
  const meta = document.querySelector('meta[name="wu-page"]');
  const metaVal = (_a = meta == null ? void 0 : meta.content) == null ? void 0 : _a.trim();
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
    "/js/home-auth-cta.js"
  ],
  privacy: [],
  terms: [],
  tryouts: ["/js/main.js"],
  profile: ["/js/profile_me.js", "/js/profile-preview-modal.js"],
  talent: ["/js/talent-lock.js", "/js/talent-modal.js", "/js/home-auth-cta.js"],
  dashboard_wrestler: [
    "/js/dashboard_wrestler.js",
    "/js/wrestler-guard-and-progress.js"
  ],
  dashboard_promoter: [
    "/js/dashboard_promoter_mytryouts.js",
    "/js/dashboard_promoter_apps.js",
    "/js/promoter-guard.js",
    "/js/promoter-apps-modal.js"
  ],
  w_index: ["/js/wrestler_public.js"],
  p_index: ["/js/promo_public.js"],
  promoter_index: ["/js/promo_me.js"]
});
const ROUTE_KEYS = new Set(Object.keys(ROUTES));
const loadedModules = /* @__PURE__ */ new Set();
function sendTelemetry(kind, payload) {
  var _a;
  try {
    const body = JSON.stringify({
      kind,
      build: BUILD_ID,
      page: ((_a = document.querySelector('meta[name="wu-page"]')) == null ? void 0 : _a.content) || getPageId(),
      ts: Date.now(),
      ...payload
    });
  } catch {
  }
}
function timeout(ms, label = "timeout") {
  return new Promise((_, rej) => setTimeout(() => rej(new Error(label)), ms));
}
async function loadModulesSerial(paths = []) {
  for (const p of paths) {
    const loader = MODULES[p];
    if (!loader) {
      log.w("[core] no module registered for", p);
      continue;
    }
    try {
      const mod = await Promise.race([loader(), timeout(12e3, `load ${p} timed out`)]);
      loadedModules.add(p);
      log.d("[core] loaded", p, mod ? Object.keys(mod) : "");
    } catch (err) {
      log.e("[core] failed to load module:", p, (err == null ? void 0 : err.message) || err);
      sendTelemetry("module_error", { mod: p, err: String(err) });
    }
  }
}
async function loadModulesParallel(paths = []) {
  const jobs = paths.map((p) => {
    const loader = MODULES[p];
    if (!loader) return Promise.resolve({ p, ok: false, err: "no module registered" });
    return Promise.race([loader(), timeout(12e3, `load ${p} timed out`)]).then((mod) => ({ p, ok: true, mod })).catch((err) => ({ p, ok: false, err }));
  });
  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    const { p, ok, mod, err } = r.status === "fulfilled" ? r.value : { p: "unknown", ok: false, err: r.reason };
    if (ok) {
      loadedModules.add(p);
      log.d("[core] loaded", p, mod ? Object.keys(mod) : "");
    } else {
      log.e("[core] failed to load page module:", p, (err == null ? void 0 : err.message) || err);
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
    for (const [page2, paths] of Object.entries(ROUTES)) {
      for (const p of paths) {
        if (!MODULES[p]) log.w(`[core] route "${page2}" references missing module:`, p);
      }
    }
  }
  await loadModulesSerial([
    "/js/config.js",
    ...BOOT
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
    const m = performance.getEntriesByType("measure").reduce((acc, x) => (acc[x.name] = Math.round(x.duration), acc), {});
    sendTelemetry("perf", m);
  }
})();
export {
  __vitePreload as _
};
