// /js/dashboard_promoter_mytryouts.js
import { apiFetch } from '/js/api.js';
import { getAuthState, isPromoter } from '/js/roles.js';

const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString(); } catch { return iso || ''; } };

function cardForTryout(t) {
  const id    = t.tryoutId || t.id || '';
  const org   = t.orgName || t.org || 'Promotion';
  const city  = t.city || '—';
  const date  = fmtDate(t.date);
  const slots = (typeof t.slots === 'number') ? `<span class="muted" style="margin-left:10px">Slots: ${t.slots}</span>` : '';
  const status = (t.status || 'open').toString().toUpperCase();
  const div = document.createElement('div');
  div.className = 'card';
  div.innerHTML = `
    <div class="badge">${status}</div>
    <h3 style="margin:6px 0 2px">${org}</h3>
    <div class="muted">${city} • ${date}</div>
    <p class="mt-3">${t.requirements || ''}</p>
    <div class="mt-3">
      <a class="btn small" href="tryouts.html#${id}">View</a>
      ${slots}
    </div>`;
  return div;
}

function emptyState(target, title, msg) {
  target.innerHTML = `
    <div class="card">
      <h3>${title}</h3>
      <p class="muted">${msg}</p>
    </div>`;
}

async function loadMyTryouts() {
  const activeEl = document.getElementById('my-active-tryouts');
  const prevEl   = document.getElementById('my-previous-tryouts');
  if (!activeEl || !prevEl) return;

  activeEl.innerHTML = `<div class="card"><h3>Loading…</h3></div>`;
  prevEl.innerHTML   = ``;

  const s = await getAuthState();
  if (!isPromoter(s)) {
    emptyState(activeEl, 'Not authorized', 'Promoter role required.');
    return;
  }

  try {
    const mine = await apiFetch('/tryouts/mine'); // JWT sent by apiFetch
    const items = Array.isArray(mine) ? mine : [];

    const today = new Date(); today.setHours(0,0,0,0);
    const isOpen = (t) => (t.status || 'open') === 'open';
    const dateVal = (t) => {
      const d = new Date(t.date);
      return isNaN(d) ? null : d;
    };

    const active = items.filter(t => {
      const d = dateVal(t);
      return isOpen(t) && d && d >= today;
    }).sort((a,b) => new Date(a.date) - new Date(b.date));

    const previous = items.filter(t => {
      const d = dateVal(t);
      return !isOpen(t) || !d || d < today;
    }).sort((a,b) => new Date(b.date) - new Date(a.date));

    // Render Active
    if (active.length === 0) {
      emptyState(activeEl, 'No active tryouts', 'Post a new tryout to get started.');
    } else {
      activeEl.innerHTML = '';
      active.forEach(t => activeEl.appendChild(cardForTryout(t)));
    }

    // Render Previous
    if (previous.length === 0) {
      emptyState(prevEl, 'No previous tryouts', 'Once your tryouts pass, they will appear here.');
    } else {
      prevEl.innerHTML = '';
      previous.forEach(t => prevEl.appendChild(cardForTryout(t)));
    }
  } catch (e) {
    console.error('loadMyTryouts failed', e);
    emptyState(activeEl, 'Error', 'Could not load your tryouts.');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadMyTryouts, { once: true });
} else {
  loadMyTryouts();
}
