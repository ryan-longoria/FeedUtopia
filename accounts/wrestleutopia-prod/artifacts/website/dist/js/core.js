const WU_DEBUG =
  (typeof window !== "undefined" && (window.WU_DEBUG === true)) ||
  (typeof localStorage !== "undefined" && !!localStorage.getItem("WU_DEBUG"));

const d = (...args) => { if (WU_DEBUG) console.debug(...args); };

/* --------- Discover modules relative to core.js --------- */
const RAW_MODULES = import.meta.glob('./**/*.js');
const MODULES = Object.fromEntries(
  Object.entries(RAW_MODULES).map(([k, loader]) => [
    '/js/' + k.replace(/^\.\//, ''),
    loader
  ])
);
d('[core] discovered modules:', Object.keys(MODULES));

/* --------- Boot order: config first, then shared deps --------- */
import './config.js';

const BOOT = [
  '/js/auth-bridge.js',
  '/js/api.js',
  '/js/forms.js',
  '/js/roles.js',
  '/js/include.js',
  '/js/nav-myprofile.js',
];

/* --------- Page id --------- */
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

/* --------- Routes (paths must match MODULES keys) --------- */
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
  tryouts: [
    '/js/main.js'
  ],

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

/* --------- Loader (quiet unless WU_DEBUG is on) --------- */
async function loadModules(paths = []) {
  for (const p of paths) {
    const loader = MODULES[p];
    if (!loader) {
      if (WU_DEBUG) console.warn('[core] no module registered for', p, '(check path/case)');
      continue;
    }
    try {
      const mod = await loader();
      try { window[p] = true; } catch {}
      d('[core] loaded', p, mod ? Object.keys(mod) : '');
    } catch (err) {
      // keep errors visible
      console.error('[core] failed to load module:', p, err);
    }
  }
}

/* --------- Boot --------- */
(async () => {
  d('[core] page boot starting');

  await loadModules([
    '/js/config.js', // ensure it’s in the graph explicitly
    ...BOOT,
  ]);

  const page = getPageId();
  d('[core] page:', page, 'routes:', ROUTES[page]);
  const toLoad = ROUTES[page];
  if (toLoad?.length) {
    await loadModules(toLoad);
  } else {
    d('[core] no route for page:', page);
  }
})();
