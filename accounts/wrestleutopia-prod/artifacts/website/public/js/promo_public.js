import { apiFetch } from '/js/api.js';

const MEDIA_BASE = (window.WU_MEDIA_BASE || '').replace(/\/+$/, '');
const mediaUrl = (k) => k && MEDIA_BASE ? `${MEDIA_BASE}/${k}` : '/assets/avatar-fallback.svg';

function safeLink(url, label) {
  const u = String(url || '').trim();
  if (!u) return '';
  try {
    const parsed = new URL(u, location.origin);
    if (!/^https?:$/.test(parsed.protocol)) return '';
  } catch { return ''; }
  const esc = (s) => s.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  return `<a href="${esc(u)}" target="_blank" rel="noopener nofollow">${esc(label || u)}</a>`;
}

function socialsRow(socials = {}) {
  const links = [
    socials.website && safeLink(socials.website, 'Website'),
    socials.twitter && safeLink(socials.twitter, 'Twitter'),
    socials.instagram && safeLink(socials.instagram, 'Instagram'),
    socials.tiktok && safeLink(socials.tiktok, 'TikTok'),
    socials.youtube && safeLink(socials.youtube, 'YouTube'),
    socials.facebook && safeLink(socials.facebook, 'Facebook'),
  ].filter(Boolean).join(' • ');
  return links ? `<div class="mt-1">${links}</div>` : '';
}

function renderTryoutList(list) {
  if (!Array.isArray(list) || !list.length) return '<p class="muted">No open tryouts.</p>';
  return `
    <div class="grid cols-2 mt-2">
      ${list.map(t => {
        const date = t.date ? new Date(t.date).toLocaleDateString() : '';
        const reqs = t.requirements || '';
        const city = t.city || '';
        return `
          <div class="card">
            <div class="badge">${(t.status || 'open').toUpperCase()}</div>
            <h3 style="margin:6px 0 2px">${t.orgName || 'Tryout'}</h3>
            <div class="muted">${city}${date ? ` • ${date}` : ''}</div>
            ${reqs ? `<p class="mt-2">${reqs}</p>` : ''}
            <a class="btn small mt-2" href="/tryouts.html#${t.tryoutId}">View</a>
          </div>`;
      }).join('')}
    </div>`;
}

function render(item, tryouts = []) {
  const el = document.getElementById('pp-wrap');
  if (!el) return;
  if (!item?.userId) { el.innerHTML = '<p class="muted">Promotion not found.</p>'; return; }

  const org = item.orgName || 'Promotion';
  const address = item.address || [item.city, item.region, item.country].filter(Boolean).join(', ');
  const bio = item.bio ? String(item.bio).replace(/\n/g,'<br/>') : '';

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:140px 1fr;gap:16px">
      <img src="${mediaUrl(item.logoKey)}" alt="Logo"
           style="width:140px;height:140px;border-radius:16px;object-fit:cover;background:#0f1224;border:1px solid #1f2546"/>
      <div>
        <h1 style="margin:0">${org}</h1>
        ${address ? `<div class="muted">${address}</div>` : ''}
        ${item.socials ? socialsRow(item.socials) : (item.website ? socialsRow({ website: item.website }) : '')}
      </div>
    </div>

    <div class="mt-3">${bio ? `<p>${bio}</p>` : '<p class="muted">No bio yet.</p>'}</div>

    <div class="card mt-3">
      <h2 class="mt-0">Open Tryouts</h2>
      ${renderTryoutList(tryouts)}
    </div>
  `;
}

function idFromPath(){
  const u = new URL(location.href);
  const pathId = (u.pathname.split('/').filter(Boolean)[1] || '').trim(); // ['p','<id>']
  const hashId = (u.hash||'').replace(/^#/, '');
  return pathId || hashId || '';
}

async function init(){
  const id = idFromPath();
  const wrap = document.getElementById('pp-wrap');
  if (!id) { wrap.innerHTML = '<p class="muted">Missing promotion id.</p>'; return; }
  try {
    const [item, tryouts] = await Promise.all([
      apiFetch(`/profiles/promoters/${encodeURIComponent(id)}`),         // PUBLIC profile
      apiFetch(`/promoters/${encodeURIComponent(id)}/tryouts`)           // PUBLIC open tryouts
    ]);
    render(item, tryouts);
  } catch (e){
    wrap.innerHTML = '<p class="muted">Could not load promotion.</p>';
    console.error(e);
  }
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, {once:true});
else init();
