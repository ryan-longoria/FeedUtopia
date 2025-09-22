import { apiFetch } from '/js/api.js';

async function getSession() {
  const { fetchAuthSession } = await import('/js/auth-bridge.js');
  return fetchAuthSession();
}
const inGroup = (payload, g) => {
  const groups = payload['cognito:groups'];
  if (!groups) return false;
  return Array.isArray(groups) ? groups.includes(g) : groups === g;
};

async function resolveMyProfileUrl() {
  const s = await getSession();
  const idTok = s?.tokens?.idToken?.toString();
  if (!idTok) return null;

  const payload = JSON.parse(atob(idTok.split('.')[1] || ''));
  const sub = payload.sub;
  const isWrestler = inGroup(payload, 'Wrestlers');
  const isPromoter = inGroup(payload, 'Promoters');

  try {
    if (isWrestler) {
      // Try to get my wrestler profile to learn my handle
      const me = await apiFetch('/profiles/wrestlers/me');
      const handle = me?.handle;
      if (handle) return `/w/#${encodeURIComponent(handle)}`;
      // No profile/handle yet → send to edit page
      return '/profile_me.html';
    }
    if (isPromoter) {
      // Public promoter page is keyed by Cognito sub (userId)
      if (sub) return `/p/#${encodeURIComponent(sub)}`;
      // Fallback: if no profile yet, go to edit page
      try {
        const me = await apiFetch('/profiles/promoters/me');
        if (me?.userId) return `/p/#${encodeURIComponent(me.userId)}`;
      } catch {}
      return '/promo_me.html';
    }
  } catch {
    // If any lookups fail, default to a sensible edit page per likely role
    if (isWrestler) return '/profile_me.html';
    if (isPromoter) return '/promo_me.html';
  }
  return null;
}

async function wireMyProfileLink() {
  const link = document.getElementById('nav-my-profile');
  if (!link) return;

  const url = await resolveMyProfileUrl();
  if (url) {
    link.href = url;
    link.style.display = '';
  } else {
    link.style.display = 'none';
  }
}

// Run on load and whenever auth changes
document.addEventListener('DOMContentLoaded', wireMyProfileLink);
window.addEventListener('auth:changed', wireMyProfileLink);
