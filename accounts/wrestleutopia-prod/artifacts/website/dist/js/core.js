const MODULES = import.meta.glob('/js/**/*.js'); // { "/js/foo.js": () => import(...) }

/** Boot sequence (order matters) — each becomes its own chunk/file */
const BOOT = [
  '/js/config.js',        // defines window.WU_API, window.WU_MEDIA_BASE
  '/js/auth-bridge.js',
  '/js/api.js',
  '/js/forms.js',
  '/js/roles.js',
  '/js/include.js',       // handles data-include="/partials/*.html"
  '/js/nav-myprofile.js',
];

/** Determine current page id */
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

/** Page-specific modules (paths must match MODULES keys exactly) */
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

/** Helper to load a list of module paths *in order*, tolerating missing files */
async function loadModules(paths = []) {
  for (const p of paths) {
    const loader = MODULES[p];
    if (!loader) {
      console.warn('[core] no module registered for', p, '(check path/case)');
      continue;
    }
    try {
      await loader();
    } catch (err) {
      console.error('[core] failed to load module:', p, err);
    }
  }
}

/** Boot the page */
(async () => {
  // 1) load shared boot (ensures window.WU_API is set before api.js uses it)
  await loadModules(BOOT);

  // 2) load page bundle(s)
  const page = getPageId();
  const toLoad = ROUTES[page];
  if (toLoad?.length) {
    await loadModules(toLoad);
  } else {
    console.debug('[core] no route for page:', page);
  }
})();
