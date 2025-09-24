// /js/dashboard_promoter_apps.js
import { apiFetch } from '/js/api.js';
import { getAuthState, isPromoter } from '/js/roles.js';

function h(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => (
    {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]
  ));
}
function dateNice(iso) { try { return iso ? new Date(iso).toLocaleString() : ''; } catch { return iso || ''; } }

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

function renderAppsIntoModal(list, meta = {}) {
  const box = document.getElementById('apps-modal-list');
  const sub = document.getElementById('apps-modal-subtitle');
  const dlg = document.getElementById('apps-modal');
  if (!box || !dlg) return;

  const labelBits = [
    meta.org && `<strong>${h(meta.org)}</strong>`,
    meta.city && h(meta.city),
    meta.date && new Date(meta.date).toLocaleDateString()
  ].filter(Boolean);
  if (sub) sub.innerHTML = labelBits.length ? labelBits.join(' • ') : 'All applicants';

  const items = Array.isArray(list) ? list : [];
  if (!items.length) {
    box.innerHTML = `<div class="card"><p class="muted">No applications yet.</p></div>`;
    dlg.showModal();
    return;
  }

  // build rows
  box.innerHTML = items.map(a => {
    const p = a.applicantProfile || {};
    const handle = p.handle || '';
    const stage  = p.stageName || '(No stage name)';
    const loc    = [p.city, p.region, p.country].filter(Boolean).join(', ');
    const when   = dateNice(a.timestamp);
    const reel   = a.reelLink ? `<a href="${h(a.reelLink)}" target="_blank" rel="noopener">Reel</a>` : '';
    const notes  = a.notes ? `<div class="muted mt-1">${h(a.notes)}</div>` : '';

    return `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:start;flex-wrap:wrap">
          <div style="min-width:260px">
            <div class="text-lg">
              ${handle ? `<a href="/w/#${encodeURIComponent(handle)}">${h(stage)}</a>` : h(stage)}
            </div>
            <div class="muted small">${h(loc)}</div>
            <div class="muted small">${h(when)}</div>
            ${notes}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            ${reel}
            ${handle ? `<a class="btn small" href="/w/#${encodeURIComponent(handle)}">View Profile</a>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  dlg.showModal();
}

async function openApplicantsModal(tryoutId, meta = {}) {
  try {
    const qs = tryoutId ? `?tryoutId=${encodeURIComponent(tryoutId)}` : '';
    const list = await apiFetch(`/applications${qs}`);
    renderAppsIntoModal(list, meta);
  } catch (e) {
    console.error(e);
    renderAppsIntoModal([], meta);
    // Optional toast:
    (window.toast?.('Could not load applications', 'error'));
  }
}
// expose to other modules
window.openApplicantsModal = openApplicantsModal;

async function loadTryoutOptionsAndPick() {
  const sel = document.getElementById('apps-filter');
  if (!sel) return '';

  // Clear stale options (keep the "All my tryouts" placeholder)
  sel.querySelectorAll('option:not(:first-child)').forEach(o => o.remove());

  try {
    const mine = await apiFetch('/tryouts/mine'); // promoter’s tryouts
    const items = Array.isArray(mine) ? mine : [];

    for (const t of items) {
      const opt = document.createElement('option');
      opt.value = t.tryoutId || '';
      const date = t.date ? new Date(t.date).toLocaleDateString() : '';
      opt.textContent = `${t.orgName || 'Tryout'} — ${t.city || ''}${date ? ` • ${date}` : ''}`;
      sel.appendChild(opt);
    }

    // If we have at least one tryout, select the first one by default
    const first = sel.querySelector('option[value]:not([value=""])');
    if (first) {
      sel.value = first.value;
      return sel.value; // the chosen tryoutId
    }
  } catch (e) {
    console.debug('loadTryoutOptionsAndPick:', e?.message || e);
  }
  return ''; // none available
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
  const chosen = await loadTryoutOptionsAndPick();      // <-- pick a tryout
  if (chosen) await loadApplications(chosen);           // <-- load promoter view

  sel?.addEventListener('change', () => {
    const id = sel.value.trim();
    if (id) loadApplications(id);
    else {
      // Optional: show a friendly message when “All my tryouts” is selected
      document.getElementById('app-list').innerHTML =
        `<div class="card"><p class="muted">Choose a tryout to see applicants.</p></div>`;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}