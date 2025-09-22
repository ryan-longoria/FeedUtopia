import { apiFetch } from '/js/api.js';

const MEDIA_BASE = (window.WU_MEDIA_BASE || '').replace(/\/+$/, '');
const mediaUrl = (k) => (k && MEDIA_BASE ? `${MEDIA_BASE}/${k}` : '/assets/avatar-fallback.svg');

// Basic text escape
const h = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// Safe external link
function safeLink(url, label) {
  const u = String(url || '').trim();
  if (!u) return '';
  try {
    const parsed = new URL(u, location.origin);
    if (!/^https?:$/.test(parsed.protocol)) return '';
  } catch { return ''; }
  return `<a href="${h(u)}" target="_blank" rel="noopener nofollow">${h(label || u)}</a>`;
}

// Return just anchor tags (no wrapper)
function socialsRow(socials = {}) {
  return [
    socials.website && safeLink(socials.website, 'Website'),
    socials.twitter && safeLink(socials.twitter, 'Twitter'),
    socials.instagram && safeLink(socials.instagram, 'Instagram'),
    socials.tiktok && safeLink(socials.tiktok, 'TikTok'),
    socials.youtube && safeLink(socials.youtube, 'YouTube'),
    socials.facebook && safeLink(socials.facebook, 'Facebook'),
  ].filter(Boolean).join(' • ');
}

function fmtDate(d) {
  try {
    const dt = new Date(d);
    if (isNaN(dt)) return '';
    return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return ''; }
}

function renderTryoutList(list) {
  if (!Array.isArray(list) || !list.length) return '<p class="muted">No open tryouts.</p>';
  return `
    <div class="grid cols-2 mt-2">
      ${list.map(t => {
        const date = t.date ? fmtDate(t.date) : '';
        const reqs = h(t.requirements || '');
        const city = h(t.city || '');
        const title = h(t.orgName || 'Tryout');
        const status = h((t.status || 'open').toUpperCase());
        const tid = h(t.tryoutId || '');
        return `
          <div class="card">
            <div class="badge">${status}</div>
            <h3 style="margin:6px 0 2px">${title}</h3>
            <div class="muted">${city}${date ? ` • ${date}` : ''}</div>
            ${reqs ? `<p class="mt-2">${reqs}</p>` : ''}
            <a class="btn small mt-2" href="/tryouts.html#${tid}">View</a>
          </div>`;
      }).join('')}
    </div>`;
}

// Now takes the container element explicitly
function render(containerEl, item, tryouts = []) {
  if (!containerEl) return;
  if (!item?.userId) { containerEl.innerHTML = '<p class="muted">Promotion not found.</p>'; return; }

  const orgName = h(item.orgName || 'Promotion');
  const cityLine = h([item.city, item.region, item.country].filter(Boolean).join(', '));
  const logo = mediaUrl(item.logoKey);
  const cover = item.coverKey ? mediaUrl(item.coverKey) : '';
  const socials = socialsRow(item.socials);

  containerEl.innerHTML = `
    <section class="hero card" style="max-width:980px;margin-inline:auto;overflow:hidden">
      ${cover ? `<img class="cover" src="${h(cover)}" alt="">` : ''}
      <div class="hero-inner container">
        <img class="avatar-ring" src="${h(logo)}" alt="${orgName} logo">
        <div class="hero-meta">
          <h1>${orgName}</h1>
          ${cityLine ? `<div class="handle">${cityLine}</div>` : ''}
          <div class="action-bar">
            ${item.website ? `<a class="btn primary small" href="${h(item.website)}" target="_blank" rel="noopener">Visit Site</a>` : ''}
            <a class="btn ghost small" href="/tryouts.html#new?org=${encodeURIComponent(item.handle||'')}">Post Tryout</a>
            <button class="btn ghost small" id="shareBtn">Share</button>
          </div>
          ${socials ? `<div class="social-row mt-2">${socials}</div>` : ''}
        </div>
      </div>
    </section>

    <section class="container" style="max-width:980px;margin-inline:auto">
      <div class="grid cols-2 mt-3">
        <div class="card">
          <h2 class="mt-0">About</h2>
          ${item.description ? `<p>${h(item.description).replace(/\n/g,'<br/>')}</p>` : `<p class="muted">No description yet.</p>`}
          <dl class="meta-list mt-2">
            ${item.emailPublic ? `<dt>Email</dt><dd>${h(item.emailPublic)}</dd>` : ''}
            ${item.phonePublic ? `<dt>Phone</dt><dd>${h(item.phonePublic)}</dd>` : ''}
          </dl>
        </div>

        <div class="card">
          <h2 class="mt-0">Upcoming Tryouts</h2>
          ${renderTryoutList(tryouts)}
        </div>
      </div>

      ${Array.isArray(item.mediaKeys) && item.mediaKeys.length ? `
        <div class="mt-3 card">
          <h2 class="mt-0">Photos</h2>
          <div class="media-grid mt-2">
            ${item.mediaKeys.map(k => `<div class="media-card"><img src="${h(mediaUrl(k))}" alt=""></div>`).join('')}
          </div>
        </div>` : ''}

      ${Array.isArray(item.rosterHandles) && item.rosterHandles.length ? `
        <div class="mt-3 card">
          <h2 class="mt-0">Roster</h2>
          <div class="media-grid mt-2">
            ${item.rosterHandles.map(hh => `
              <a class="media-card" href="/w/#${encodeURIComponent(hh)}" aria-label="View roster profile ${h(hh)}">
                <img src="/assets/avatar-fallback.svg" alt="">
              </a>`).join('')}
          </div>
        </div>` : ''}
    </section>
  `;

  // Share button handler
  const shareBtn = containerEl.querySelector('#shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        shareBtn.textContent = 'Link Copied!';
        setTimeout(() => (shareBtn.textContent = 'Share'), 1300);
      } catch {
        alert('Copy failed. You can copy the URL from the address bar.');
      }
    }, { once: true });
  }
}

function idFromPath(){
  const u = new URL(location.href);
  const pathSegs = u.pathname.split('/').filter(Boolean);
  const pathId = (pathSegs[1] || '').trim(); // e.g., ['p', '<id>']
  const hashId = (u.hash||'').replace(/^#/, '');
  return pathId || hashId || '';
}

async function init(){
  const id = idFromPath();
  const wrap = document.getElementById('pp-wrap');
  if (!wrap) return;
  if (!id) { wrap.innerHTML = '<p class="muted">Missing promotion id.</p>'; return; }
  try {
    const [item, tryouts] = await Promise.all([
      apiFetch(`/profiles/promoters/${encodeURIComponent(id)}`),   // PUBLIC profile
      apiFetch(`/promoters/${encodeURIComponent(id)}/tryouts`)    // PUBLIC open tryouts
    ]);
    render(wrap, item, tryouts);
  } catch (e){
    wrap.innerHTML = '<p class="muted">Could not load promotion.</p>';
    console.error(e);
  }
}

if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init, {once:true});
else init();
