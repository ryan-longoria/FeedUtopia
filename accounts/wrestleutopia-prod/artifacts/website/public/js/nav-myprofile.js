import { apiFetch } from '/js/api.js';
import { getAuthState, isWrestler, isPromoter } from '/js/roles.js';

async function resolveUrl() {
  const state = await getAuthState();          // { sub, groups, ... }
  if (!state) return '#';

  if (isWrestler(state)) {
    // Need the handle for the public wrestler page
    try {
      const me = await apiFetch('/profiles/wrestlers/me');
      if (me?.handle) return `/w/#${encodeURIComponent(me.handle)}`;
    } catch {}
    // No handle/profile yet — send to wrestler dashboard to finish profile
    return '/dashboard_wrestler.html';
  }

  if (isPromoter(state)) {
    // Promoter public page is keyed by sub; /p/ supports #<id>
    if (state.sub) return `/p/#${encodeURIComponent(state.sub)}`;
    // Fallback: promoter dashboard
    return '/dashboard_promoter.html';
  }

  // Not in a known role: do nothing (link stays #)
  return '#';
}

async function upgradeLinkHref() {
  const link = document.getElementById('nav-my-profile');
  if (!link) return;

  // Don’t change visibility here; parent gate handles it.
  const url = await resolveUrl();
  if (url && url !== '#') link.setAttribute('href', url);

  // Recompute on click if still unresolved or if user just got a handle
  link.addEventListener('click', async (e) => {
    const current = link.getAttribute('href') || '#';
    if (current !== '#') return; // already upgraded
    e.preventDefault();
    const fresh = await resolveUrl();
    if (fresh && fresh !== '#') {
      link.setAttribute('href', fresh);
      location.href = fresh;
    }
  });
}

document.addEventListener('DOMContentLoaded', upgradeLinkHref);
window.addEventListener('auth:changed', upgradeLinkHref);
