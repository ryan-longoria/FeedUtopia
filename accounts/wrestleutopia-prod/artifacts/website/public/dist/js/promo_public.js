// /js/promo_public.js
import { apiFetch } from '/js/api.js';

const MEDIA_BASE = (window.WU_MEDIA_BASE || '').replace(/\/+$/, '');
const mediaUrl = (k) => k && MEDIA_BASE ? `${MEDIA_BASE}/${k}` : '/assets/avatar-fallback.svg';

function idFromPath(){
  // supports /p/<ownerId> and /p/#<ownerId>
  const u = new URL(location.href);
  const pathId = (u.pathname.split('/').filter(Boolean)[1] || '').trim(); // ['p','<id>']
  const hashId = (u.hash||'').replace(/^#/, '');
  return pathId || hashId || '';
}

function render(item){
  const el = document.getElementById('pp-wrap');
  if (!el){ return; }
  if (!item?.userId){
    el.innerHTML = '<p class="muted">Promotion not found.</p>';
    return;
  }

  const org = item.orgName || 'Promotion';
  const loc = [item.city, item.region, item.country].filter(Boolean).join(', ');
  const website = item.website ? `<a href="${item.website}" target="_blank" rel="noopener">Website</a>` : '';
  const contact = item.contact ? `<span>${item.contact}</span>` : '';
  const sep = (website && contact) ? ' • ' : '';
  const bio = item.bio ? String(item.bio).replace(/\n/g,'<br/>') : '';

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:140px 1fr;gap:16px">
      <img src="${mediaUrl(item.logoKey)}" alt="Logo"
           style="width:140px;height:140px;border-radius:16px;object-fit:cover;background:#0f1224;border:1px solid #1f2546"/>
      <div>
        <h1 style="margin:0">${org}</h1>
        <div class="muted">${loc}</div>
        <div class="mt-2">${website}${sep}${contact}</div>
      </div>
    </div>
    <div class="mt-3">${bio ? `<p>${bio}</p>` : '<p class="muted">No bio yet.</p>'}</div>
  `;
}

async function init(){
  const id = idFromPath();
  if (!id){ document.getElementById('pp-wrap').innerHTML = '<p class="muted">Missing promotion id.</p>'; return; }
  try {
    const item = await apiFetch(`/profiles/promoters/${encodeURIComponent(id)}`); // PUBLIC
    render(item);
  } catch (e){
    document.getElementById('pp-wrap').innerHTML = '<p class="muted">Could not load promotion.</p>';
    console.error(e);
  }
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, {once:true});
else init();
