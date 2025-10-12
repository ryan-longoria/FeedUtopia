// public/js/core.js — single entry for all pages

// Build-time discovery: find every JS module under the same folder as core.js
// (i.e., /public/js/**). Then remap the keys to '/js/...' so our ROUTES match.
const RAW_MODULES = import.meta.glob('./**/*.js'); // keys like './dashboard_wrestler.js'
const MODULES = Object.fromEntries(
  Object.entries(RAW_MODULES).map(([k, loader]) => {
    const abs = '/js/' + k.replace(/^\.\//, ''); // './foo.js' -> '/js/foo.js'
    return [abs, loader];
  })
);

console.debug('[core] discovered modules:', Object.keys(MODULES));

// 1) Define globals first (WU_API, WU_MEDIA_BASE)
import './config.js';

// 2) Shared boot (order preserved)
const BOOT = [
  '/js/auth-bridge.js',
  '/js/api.js',
  '/js/forms.js',
  '/js/roles.js',
  '/js/include.js',       // handles data-include="/partials/*.html"
  '/js/nav-myprofile.js',
];

// 3) Page id (from <meta name="wu-page"> or inferred from pathname)
function getPageId() {
  const meta = document.querySelector('meta[name="wu-page"]');
  if (meta?.content) return meta.content.trim();

  const p = location.pathname.replace(/\/+$/, '');
  if (p === '/' || p === '/index.html') return 'index';
  if (/\/w(?:\/index\.html)?$/.test(p)) return 'w_index';
  if (/\/p(?:\/index\.html)?$/.test(p)) return 'p_index';
  if (/\/promoter(?:\/index\.html)?$/.test(p)) return 'promoter_index';
  const file = p.split('/').pop();
  return (file || '').replace(/\.html$/i, '');
}

// 4) Page-specific modules (paths must match MODULES keys: '/js/....js')
const ROUTES = {
  index: [
    '/js/main.js',
    '/js/home-redirect.js',
    '/js/home-free-offer-hide.js',
    '/js/home-tryouts-locked.js',
    '/js/home-auth-cta.js',
  ],
  privacy: [],
  terms: [],
  tryouts: [],

  profile: [
    '/js/profile_me.js',
    '/js/profile-preview-modal.js',
  ],

  talent: [
    '/js/talent-lock.js',
    '/js/talent-modal.js',
    '/js/home-auth-cta.js',
  ],

  dashboard_wrestler: [
    '/js/dashboard_wrestler.js',
    '/js/wrestler-guard-and-progress.js',
  ],

  dashboard_promoter: [
    '/js/dashboard_promoter_mytryouts.js',
    '/js/dashboard_promoter_apps.js',
    '/js/promoter-guard.js',
    '/js/promoter-apps-modal.js',
  ],

  w_index: ['/js/wrestler_public.js'],
  p_index: ['/js/promo_public.js'],
  promoter_index: ['/js/promo_me.js'],
};

// 5) Loader that tolerates missing files & logs what happens
async function loadModules(paths = []) {
  for (const p of paths) {
    const loader = MODULES[p];
    if (!loader) {
      console.warn('[core] no module registered for', p, '(check path/case)');
      continue;
    }
    try {
      const mod = await loader();
      // optional breadcrumb for quick checks:
      try { window[p] = true; } catch {}
      console.debug('[core] loaded', p, mod ? Object.keys(mod) : '');
    } catch (err) {
      console.error('[core] failed to load module:', p, err);
    }
  }
}

// 6) Kick off the page
(async () => {
  console.debug('[core] page boot starting');

  // shared boot (ensures config runs before api.js uses it)
  await loadModules([
    '/js/config.js',     // include explicitly so it’s in the graph
    ...BOOT,
  ]);

  const page = getPageId();
  console.debug('[core] page:', page, 'routes:', ROUTES[page]);
  const toLoad = ROUTES[page];
  if (toLoad?.length) {
    await loadModules(toLoad);
  } else {
    console.debug('[core] no route for page:', page);
  }
})();
