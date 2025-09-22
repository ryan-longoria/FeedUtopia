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

  // Make it focusable/clickable immediately
  if (!link.getAttribute('href')) link.setAttribute('href', '#');

  // Show it whenever auth says we're "in"
  link.style.display = '';

  // Compute the target now…
  let target = await resolveMyProfileUrl();

  // …and if still unknown, choose a sensible default based on groups quickly
  // (lightweight parse without API calls)
  if (!target) {
    const s = await getSession();
    const payload = parseIdPayload(s?.tokens?.idToken?.toString());
    if (inGroup(payload, 'Wrestlers')) target = '/profile_me.html';
    else if (inGroup(payload, 'Promoters')) target = '/promo_me.html';
  }

  // Set the href if we have it; otherwise keep "#" and let click recalc
  if (target) link.setAttribute('href', target);

  // Always handle click to recompute right before navigating (handles races)
  link.addEventListener('click', async (e) => {
    // If we already have a real URL (not "#"), let the browser navigate
    const currentHref = link.getAttribute('href') || '';
    if (currentHref && currentHref !== '#') return;

    e.preventDefault();
    const url = await resolveMyProfileUrl();
    if (url) {
      link.setAttribute('href', url);
      location.href = url;
    } else {
      // Final fallback
      location.href = '/profile_me.html';
    }
  }, { once: false });
}

// Run on load and whenever auth changes
document.addEventListener('DOMContentLoaded', wireMyProfileLink);
window.addEventListener('auth:changed', wireMyProfileLink);
