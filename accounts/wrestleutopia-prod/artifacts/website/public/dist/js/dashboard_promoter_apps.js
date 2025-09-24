// /js/dashboard_promoter_apps.js
import { apiFetch } from '/js/api.js';
import { getAuthState, isPromoter } from '/js/roles.js';

function mediaUrlFromKey(key) {
  if (!key) return '/assets/avatar-fallback.svg';
  if (String(key).startsWith('http')) return key;
  const base = (window.WU_MEDIA_BASE || '').replace(/\/+$/, '');
  return base ? `${base}/${key}` : '/assets/avatar-fallback.svg';
}

function renderApps(list) {
  const root = document.getElementById('app-list');
  if (!root) return;
  root.innerHTML = '';

  const items = Array.isArray(list) ? list : [];
  if (items.length === 0) {
    root.innerHTML = `<div class="card"><p class="muted">No applications yet.</p></div>`;
    return;
  }

  for (const a of items) {
    const p = a.applicantProfile || {};
    const handle = p.handle || '';
    const stage  = p.stageName || '(No stage name)';
    const loc    = [p.city, p.region].filter(Boolean).join(', ');
    const photo  = mediaUrlFromKey(p.photoKey);
    const when   = a.timestamp ? new Date(a.timestamp).toLocaleString() : '';

    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center">
        <img src="${photo}" alt="" width="56" height="56" class="avatar br-full" loading="lazy"/>
        <div style="flex:1">
          <div class="text-lg">${stage}</div>
          <div class="muted">${loc || ''}</div>
          <div class="muted small mt-1">${when}</div>
          ${a.notes ? `<p class="mt-2">${String(a.notes).replace(/</g,'&lt;')}</p>` : ''}
          ${a.reelLink ? `<p class="mt-1"><a href="${a.reelLink}" target="_blank" rel="noopener">Watch Reel</a></p>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${handle ? `<a class="btn small" href="/w/#${encodeURIComponent(handle)}">View Profile</a>` : ''}
        </div>
      </div>
    `;
    root.appendChild(el);
  }
}

async function loadTryoutOptions() {
  const sel = document.getElementById('apps-filter');
  if (!sel) return '';
  // Load the promoter’s own tryouts to populate the dropdown
  try {
    const mine = await apiFetch('/tryouts/mine');
    const items = Array.isArray(mine) ? mine : [];
    for (const t of items) {
      const opt = document.createElement('option');
      opt.value = t.tryoutId || '';
      const date = t.date ? new Date(t.date).toLocaleDateString() : '';
      opt.textContent = `${t.orgName || 'Tryout'} — ${t.city || ''}${date ? ` • ${date}` : ''}`;
      sel.appendChild(opt);
    }
  } catch (e) {
    // non-fatal
    console.debug('loadTryoutOptions:', e?.message || e);
  }
  return sel.value;
}

async function loadApplications(tryoutId = '') {
  const qs = tryoutId ? `?tryoutId=${encodeURIComponent(tryoutId)}` : '';
  const list = await apiFetch(`/applications${qs}`);
  renderApps(list);
}

async function init() {
  const s = await getAuthState();
  if (!isPromoter(s)) return;

  const sel = document.getElementById('apps-filter');
  await loadTryoutOptions();
  await loadApplications(sel?.value || '');

  sel?.addEventListener('change', () => loadApplications(sel.value));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
