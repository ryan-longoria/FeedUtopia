// public/js/core.js — single entry for all pages (Vite-friendly)

// 1) Define globals first (WU_API, WU_MEDIA_BASE)
import "/js/config.js";

// 2) Shared boot (order preserved)
import "/js/auth-bridge.js";
import "/js/api.js";
import "/js/forms.js";
import "/js/roles.js";
import "/js/include.js";       // handles data-include="/partials/*.html"
import "/js/nav-myprofile.js";

/**
 * KEY CHANGE:
 * Tell Vite about every page module that might be loaded at runtime so it
 * actually emits them into dist/. We keep it lazy (code-split) by default.
 * Adjust the pattern (e.g. to '/js/*.js') if you only keep top-level files.
 */
const MODULES = import.meta.glob('/js/**/*.js'); // { [path]: () => Promise<Module> }

/** Determine the current page id (meta preferred, path fallback). */
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

/**
 * Declarative routes: page id -> array of JS module paths.
 * IMPORTANT: Paths here must match the keys Vite generates in MODULES.
 * e.g. '/js/dashboard_wrestler.js' (leading slash, same as in import.meta.glob).
 */
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

/** Load an array of module paths using the MODULES manifest Vite created. */
async function loadModules(paths = []) {
  for (const p of paths) {
    const loader = MODULES[p]; // this exists only if the path matched the glob
    if (!loader) {
      // Helps catch typos or mismatches between ROUTES and the glob pattern
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

/** Boot the current page. */
(async () => {
  const page = getPageId();
  const toLoad = ROUTES[page];
  if (!toLoad) {
    console.debug("[core] no route for page:", page);
    return;
  }
  await loadModules(toLoad);
})();
