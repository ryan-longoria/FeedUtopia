// public/js/core.js — single entry for all pages

// 1) Define globals first (WU_API, WU_MEDIA_BASE)
import "/js/config.js";

// 2) Shared boot (order preserved)
import "/js/auth-bridge.js";
import "/js/api.js";
import "/js/forms.js";
import "/js/roles.js";
import "/js/include.js";       // handles data-include="/partials/*.html"
import "/js/nav-myprofile.js";

// 3) Page router: use <meta name="wu-page" content="...">
function getPageId() {
  const meta = document.querySelector('meta[name="wu-page"]');
  if (meta?.content) return meta.content.trim();

  // Fallback inference if meta missing
  const p = location.pathname.replace(/\/+$/, "");
  if (p === "/" || p === "/index.html") return "index";
  if (/\/w(?:\/index\.html)?$/.test(p)) return "w_index";
  if (/\/p(?:\/index\.html)?$/.test(p)) return "p_index";
  if (/\/promoter(?:\/index\.html)?$/.test(p)) return "promoter_index";
  const file = p.split("/").pop();
  return (file || "").replace(/\.html$/i, "");
}

// 4) Map page ids -> page module(s)
// NOTE: list ONLY files that actually exist in public/js.
// If you’re unsure a file exists, it’s safe to keep it here; we’ll ignore
// missing ones at runtime using @vite-ignore + try/catch.
const ROUTES = {
  index: [
    "/js/main.js",
    "/js/home-redirect.js",
    "/js/home-free-offer-hide.js",
    "/js/home-tryouts-locked.js",
    "/js/home-auth-cta.js",
  ],
  privacy: [],
  terms: [],
  tryouts: [],

  profile: [
    "/js/profile_me.js",
    "/js/profile-preview-modal.js",
  ],

  talent: [
    "/js/talent-lock.js",
    "/js/talent-modal.js",
    "/js/home-auth-cta.js",
  ],

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
};

// 5) Loader that tolerates missing files
async function loadModules(paths = []) {
  for (const p of paths) {
    try {
      // @vite-ignore prevents build-time resolution so optional files don’t break the build
      await import(/* @vite-ignore */ p);
    } catch (err) {
      // Only log if it 404’d or wasn’t found; other errors you might want to surface
      console.debug("[core] optional module not loaded:", p, err?.message || err);
    }
  }
}

// 6) Kick off the page
const page = getPageId();
const toLoad = ROUTES[page];
if (toLoad) {
  loadModules(toLoad).catch((e) =>
    console.error("[core] page init failed:", page, e)
  );
} else {
  console.debug("[core] no route for page:", page);
}
