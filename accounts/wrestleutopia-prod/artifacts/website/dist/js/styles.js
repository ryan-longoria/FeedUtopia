const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["js/api.js","js/auth-bridge.js","js/dashboard_promoter_apps.js","js/roles.js","js/dashboard_promoter_mytryouts.js","js/dashboard_wrestler2.js","js/forms.js","js/home-auth-cta.js","js/home-free-offer-hide.js","js/home-redirect.js","js/home-tryouts-locked.js","js/main.js","js/profile_me.js","js/media.js","js/promo_me.js","js/promo_public.js","js/promoter-guard.js","js/public_profile.js","js/talent-lock.js","js/wrestler-guard-and-progress.js","js/wrestler_public.js"])))=>i.map(i=>d[i]);
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
const MODULES = /* @__PURE__ */ Object.assign({ "/js/api.js": () => __vitePreload(() => import("./api.js"), true ? __vite__mapDeps([0,1]) : void 0), "/js/auth-bridge.js": () => __vitePreload(() => import("./auth-bridge.js"), true ? [] : void 0), "/js/config.js": () => __vitePreload(() => import("./config.js"), true ? [] : void 0), "/js/dashboard_promoter_apps.js": () => __vitePreload(() => import("./dashboard_promoter_apps.js"), true ? __vite__mapDeps([2,0,1,3]) : void 0), "/js/dashboard_promoter_mytryouts.js": () => __vitePreload(() => import("./dashboard_promoter_mytryouts.js"), true ? __vite__mapDeps([4,0,1,3]) : void 0), "/js/dashboard_wrestler.js": () => __vitePreload(() => import("./dashboard_wrestler2.js"), true ? __vite__mapDeps([5,0,1,3]) : void 0), "/js/forms.js": () => __vitePreload(() => import("./forms.js"), true ? __vite__mapDeps([6,0,1,3]) : void 0), "/js/home-auth-cta.js": () => __vitePreload(() => import("./home-auth-cta.js"), true ? __vite__mapDeps([7,3,1]) : void 0), "/js/home-free-offer-hide.js": () => __vitePreload(() => import("./home-free-offer-hide.js"), true ? __vite__mapDeps([8,3,1]) : void 0), "/js/home-redirect.js": () => __vitePreload(() => import("./home-redirect.js"), true ? __vite__mapDeps([9,3,1]) : void 0), "/js/home-tryouts-locked.js": () => __vitePreload(() => import("./home-tryouts-locked.js"), true ? __vite__mapDeps([10,3,1]) : void 0), "/js/include.js": () => __vitePreload(() => import("./include.js"), true ? [] : void 0), "/js/main.js": () => __vitePreload(() => import("./main.js"), true ? __vite__mapDeps([11,0,1]) : void 0), "/js/media.js": () => __vitePreload(() => import("./media.js"), true ? [] : void 0), "/js/nav-myprofile.js": () => __vitePreload(() => import("./nav-myprofile.js"), true ? [] : void 0), "/js/profile-preview-modal.js": () => __vitePreload(() => import("./profile-preview-modal.js"), true ? [] : void 0), "/js/profile_me.js": () => __vitePreload(() => import("./profile_me.js"), true ? __vite__mapDeps([12,0,1,3,13]) : void 0), "/js/promo_me.js": () => __vitePreload(() => import("./promo_me.js"), true ? __vite__mapDeps([14,0,1,3,13]) : void 0), "/js/promo_public.js": () => __vitePreload(() => import("./promo_public.js"), true ? __vite__mapDeps([15,0,1,13]) : void 0), "/js/promoter-apps-modal.js": () => __vitePreload(() => import("./promoter-apps-modal.js"), true ? [] : void 0), "/js/promoter-guard.js": () => __vitePreload(() => import("./promoter-guard.js"), true ? __vite__mapDeps([16,3,1]) : void 0), "/js/public_profile.js": () => __vitePreload(() => import("./public_profile.js"), true ? __vite__mapDeps([17,0,1,13]) : void 0), "/js/roles.js": () => __vitePreload(() => import("./roles.js"), true ? __vite__mapDeps([3,1]) : void 0), "/js/talent-lock.js": () => __vitePreload(() => import("./talent-lock.js"), true ? __vite__mapDeps([18,3,1]) : void 0), "/js/talent-modal.js": () => __vitePreload(() => import("./talent-modal.js"), true ? [] : void 0), "/js/wrestler-guard-and-progress.js": () => __vitePreload(() => import("./wrestler-guard-and-progress.js"), true ? __vite__mapDeps([19,3,1]) : void 0), "/js/wrestler_public.js": () => __vitePreload(() => import("./wrestler_public.js"), true ? __vite__mapDeps([20,0,1,13]) : void 0) });
const BOOT = [
  "/js/config.js",
  // defines window.WU_API, window.WU_MEDIA_BASE
  "/js/auth-bridge.js",
  "/js/api.js",
  "/js/forms.js",
  "/js/roles.js",
  "/js/include.js",
  // handles data-include="/partials/*.html"
  "/js/nav-myprofile.js"
];
function getPageId() {
  const meta = document.querySelector('meta[name="wu-page"]');
  if (meta == null ? void 0 : meta.content) return meta.content.trim();
  const p = location.pathname.replace(/\/+$/, "");
  if (p === "/" || p === "/index.html") return "index";
  if (/\/w(?:\/index\.html)?$/.test(p)) return "w_index";
  if (/\/p(?:\/index\.html)?$/.test(p)) return "p_index";
  if (/\/promoter(?:\/index\.html)?$/.test(p)) return "promoter_index";
  const file = p.split("/").pop();
  return (file || "").replace(/\.html$/i, "");
}
const ROUTES = {
  index: [
    "/js/main.js",
    "/js/home-redirect.js",
    "/js/home-free-offer-hide.js",
    "/js/home-tryouts-locked.js",
    "/js/home-auth-cta.js"
  ],
  privacy: [],
  terms: [],
  tryouts: [],
  profile: [
    "/js/profile_me.js",
    "/js/profile-preview-modal.js"
  ],
  talent: [
    "/js/talent-lock.js",
    "/js/talent-modal.js",
    "/js/home-auth-cta.js"
  ],
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
};
async function loadModules(paths = []) {
  for (const p of paths) {
    const loader = MODULES[p];
    if (!loader) {
      console.warn("[core] no module registered for", p, "(check path/case)");
      continue;
    }
    try {
      await loader();
    } catch (err) {
      console.error("[core] failed to load module:", p, err);
    }
  }
}
(async () => {
  await loadModules(BOOT);
  const page = getPageId();
  const toLoad = ROUTES[page];
  if (toLoad == null ? void 0 : toLoad.length) {
    await loadModules(toLoad);
  } else {
    console.debug("[core] no route for page:", page);
  }
})();
export {
  __vitePreload as _
};
