import { apiFetch } from '/js/api.js';

function b64urlDecode(input = '') {
  // JWT payload is base64url, not standard base64
  const s = input.replace(/-/g, '+').replace(/_/g, '/')
                 .padEnd(Math.ceil(input.length / 4) * 4, '=');
  try { return atob(s); } catch { return ''; }
}

async function getSession() {
  const { fetchAuthSession } = await import('/js/auth-bridge.js');
  return fetchAuthSession();
}

function parseIdPayload(idTok) {
  try {
    const parts = String(idTok).split('.');
    if (parts.length < 2) return null;
    const json = b64urlDecode(parts[1]);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

const inGroup = (payload, g) => {
  const groups = payload?.['cognito:groups'];
  if (!groups) return false;
  return Array.isArray(groups) ? groups.includes(g) : groups === g;
};

async function resolveMyProfileUrl() {
  const s = await getSession();
  const idTok = s?.tokens?.idToken?.toString();
  const payload = parseIdPayload(idTok);
  if (!payload) return null;

  const sub = payload.sub;
  const isWrestler = inGroup(payload, 'Wrestlers');
  const isPromoter = inGroup(payload, 'Promoters');

  try {
    if (isWrestler) {
      // Get wrestler handle for public page; fall back to edit if missing
      const me = await apiFetch('/profiles/wrestlers/me').catch(() => null);
      const handle = me?.handle;
      return handle ? `/w/#${encodeURIComponent(handle)}` : '/profile_me.html';
    }
    if (isPromoter) {
      // Promoter public page is keyed by Cognito sub (userId)
      return sub ? `/p/#${encodeURIComponent(sub)}` : '/promo_me.html';
    }
  } catch {
    // fall through to null so caller can choose a default
  }
  return null;
}

async function wireMyProfileLink() {
  const link = document.getElementById('nav-my-profile');
  if (!link) return;

  // Start with safe default (already set in HTML), then upgrade
  let target = await resolveMyProfileUrl();

  if (!target) {
    // quick fallback by group without API call
    const s = await getSession();
    const payload = parseIdPayload(s?.tokens?.idToken?.toString());
    if (inGroup(payload, 'Promoters') && payload?.sub) {
      target = `/p/#${encodeURIComponent(payload.sub)}`;
    }
  }

  if (target) link.setAttribute('href', target);

  // Recompute on click if still default
  link.addEventListener('click', async (e) => {
    const h = (link.getAttribute('href') || '').trim();
    if (h && h !== '#' && h !== '/profile_me.html') return; // already upgraded

    e.preventDefault();
    const url = await resolveMyProfileUrl();
    location.href = url || '/profile_me.html';
  });
}

// Run on load and whenever auth changes
document.addEventListener('DOMContentLoaded', wireMyProfileLink);
window.addEventListener('auth:changed', wireMyProfileLink);
