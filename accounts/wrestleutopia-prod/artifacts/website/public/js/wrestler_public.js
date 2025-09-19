import { apiFetch } from '/js/api.js';

function objUrlFromKey(key) {
  // If you proxy S3 via CloudFront, set window.WU_MEDIA_BASE = 'https://cdn...'
  if (!key) return '/assets/avatar-fallback.svg';
  if (key.startsWith('http')) return key;
  if (window.WU_MEDIA_BASE) return `${window.WU_MEDIA_BASE}/${key}`;
  // Fallback: no direct render (S3 s3:// URIs aren’t browser-loadable)
  return '/assets/avatar-fallback.svg';
}

function h(str){ return (str || '').replace(/[&<>"]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[s])); }

async function run() {
  const wrap = document.getElementById('wp-wrap');
  const handle = (location.hash || '').replace(/^#/, '').trim();
  if (!handle) { wrap.innerHTML = '<div class="card"><h2>Profile not found</h2></div>'; return; }

  try {
    const p = await apiFetch(`/profiles/wrestlers/${encodeURIComponent(handle)}`);

    const ring = p.ring || p.name || handle;
    const loc  = [p.city, p.region, p.country].filter(Boolean).join(', ');
    const img  = objUrlFromKey(p.photoKey);
    const chips = Array.isArray(p.gimmicks) ? p.gimmicks : [];

    document.title = `${ring} – WrestleUtopia`;

    wrap.innerHTML = `
      <div style="display:grid;grid-template-columns:160px 1fr;gap:16px">
        <img src="${img}" alt="${h(ring)}" style="width:160px;height:160px;border-radius:999px;object-fit:cover;background:#0f1224;border:1px solid #1f2546"/>
        <div>
          <h1 style="margin:0">${h(ring)}</h1>
          <div class="muted">${h(loc)}</div>
          <div class="chips mt-2">${chips.map(c=>`<span class="chip">${h(c)}</span>`).join('')}</div>
          ${p.verified_school ? '<div class="mt-2"><span class="badge">Verified school</span></div>' : ''}
        </div>
      </div>

      <div class="mt-4">
        ${p.bio ? `<p>${h(p.bio).replace(/\n/g,'<br/>')}</p>` : '<p class="muted">No bio yet.</p>'}
      </div>

      <div class="grid cols-3 mt-4">
        ${p.reel ? `<a class="card" href="${h(p.reel)}" target="_blank" rel="noopener">
          <h3>Watch Reel</h3><p class="muted">Opens in a new tab</p></a>` : ''}
        ${typeof p.rate_min === 'number' || typeof p.rate_max === 'number' ? `
          <div class="card"><h3>Typical Rate</h3>
          <p class="muted">$${p.rate_min ?? 0} – $${p.rate_max ?? 0}</p></div>` : ''}
        ${p.years != null ? `<div class="card"><h3>Experience</h3><p class="muted">${p.years} years</p></div>` : ''}
      </div>
    `;
  } catch (e) {
    console.error(e);
    wrap.innerHTML = `<div class="card"><h2>Profile not found</h2><p class="muted">We couldn’t load @${h(handle)}.</p></div>`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', run);
} else { run(); }
