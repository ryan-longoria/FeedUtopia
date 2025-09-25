// /js/public_profile.js
import { apiFetch } from '/js/api.js';

const MEDIA_BASE = (window.WU_MEDIA_BASE || '').replace(/\/+$/, '');

function photoUrlFromKey(key) {
  if (!key) return '/assets/avatar-fallback.svg';
  if (MEDIA_BASE) return `${MEDIA_BASE}/${key}`;
  return '/assets/avatar-fallback.svg';
}

function getHandleFromUrl() {
  // supports /w/<handle> and /w/index.html?handle=<handle>
  const path = location.pathname.replace(/\/+$/, '');
  const parts = path.split('/');
  let handle = parts.length >= 3 ? parts[2] : '';
  if (!handle) {
    const q = new URLSearchParams(location.search);
    handle = q.get('handle') || '';
  }
  return handle;
}

function set(el, text) { const n = document.getElementById(el); if (n) n.textContent = text || ''; }
function html(el, markup) { const n = document.getElementById(el); if (n) n.innerHTML = markup || ''; }

function toast(text, type = 'success') {
  const t = document.querySelector('#toast');
  if (!t) return console.log(text);
  t.textContent = text;
  t.classList.toggle('error', type === 'error');
  t.style.display = 'block';
  setTimeout(() => (t.style.display = 'none'), 2400);
}

async function init() {
  const handle = getHandleFromUrl();
  if (!handle) {
    html('profile', `<div class="card"><h2>Profile not found</h2><p class="muted">Missing handle.</p></div>`);
    return;
  }

  try {
    const p = await apiFetch(`/profiles/wrestlers/${encodeURIComponent(handle)}`);

    // Title
    document.title = `${p.stageName || 'Wrestler'} – WrestleUtopia`;

    // Hero
    const img = document.getElementById('ph-avatar');
    if (img) img.src = photoUrlFromKey(p.photoKey);

    set('ph-stage', p.stageName || 'Wrestler');
    const loc = [p.city, p.region, p.country].filter(Boolean).join(', ');
    set('ph-loc', loc);
    set('ph-name', p.name || '');
    set('ph-dob', p.dob || '');

    // Bio
    html('ph-bio', p.bio ? `<p>${(p.bio || '').replace(/\n/g, '<br/>')}</p>` : '<p class="muted">No bio yet.</p>');

    // Gimmicks
    const gimmicks = Array.isArray(p.gimmicks) ? p.gimmicks : [];
    const chips = gimmicks.map(g => `<span class="chip">${g}</span>`).join('');
    html('ph-gimmicks', chips || '');

  } catch (e) {
    if (String(e).includes('API 401')) {
      html('profile', `<div class="card"><h2>Sign in required</h2><p class="muted">Please sign in to view this profile.</p></div>`);
      return;
    }
    console.error(e);
    html('profile', `<div class="card"><h2>Profile not found</h2><p class="muted">We couldn’t find <code>${handle}</code>.</p></div>`);
    toast('Profile not found', 'error');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
