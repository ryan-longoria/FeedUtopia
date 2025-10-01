// /js/promo_public.js
import { apiFetch } from '/js/api.js';
import { mediaUrl } from '/js/media.js';

const h = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Cache-bust only profile-like assets so users see new logos/covers immediately
const needsBust = (k) =>
  /^public\/promoters\/profiles\//.test(String(k)) || /^profiles\//.test(String(k)); // legacy support

// External link guard
function safeLink(url, label) {
  const u = String(url || '').trim();
  if (!u) return '';
  try {
    const parsed = new URL(u, location.origin);
    if (!/^https?:$/.test(parsed.protocol)) return '';
  } catch {
    return '';
  }
  return `<a href="${h(u)}" target="_blank" rel="noopener nofollow">${h(label || u)}</a>`;
}

// Social anchors (caller wraps once)
function socialsRow(socials) {
  const s = (socials && typeof socials === 'object') ? socials : {};
  return [
    s.website   && safeLink(s.website, 'Website'),
    s.twitter   && safeLink(s.twitter, 'Twitter'),
    s.instagram && safeLink(s.instagram, 'Instagram'),
    s.tiktok    && safeLink(s.tiktok, 'TikTok'),
    s.youtube   && safeLink(s.youtube, 'YouTube'),
    s.facebook  && safeLink(s.facebook, 'Facebook'),
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

function buildFullAddress(item = {}) {
  const composed = [item.street1, item.street2, item.city, item.region, item.postalCode, item.country]
    .filter(Boolean).join(', ');
  return item.address ? String(item.address) : composed;
}

function idFromPath(){
  const u = new URL(location.href);
  const segs = u.pathname.split('/').filter(Boolean);
  const pathId = (segs[1] || '').trim(); // e.g. /p/<id>
  const hashId = (u.hash||'').replace(/^#/, '');
  return pathId || hashId || '';
}

// Renders the public promoter page into containerEl
function render(containerEl, item, tryouts = []) {
  if (!containerEl) return;
  if (!item?.userId) { containerEl.innerHTML = '<p class="muted">Promotion not found.</p>'; return; }

  const orgName = h(item.orgName || 'Promotion');

  // Logo + Cover with selective cache-busting
  const logoBase  = item.logoKey  ? mediaUrl(item.logoKey)  : '/assets/avatar-fallback.svg';
  const coverBase = item.coverKey ? mediaUrl(item.coverKey) : '';
  const logo  = item.logoKey  ? (needsBust(item.logoKey)  ? `${logoBase}?v=${Date.now()}`  : logoBase)  : logoBase;
  const cover = item.coverKey ? (needsBust(item.coverKey) ? `${coverBase}?v=${Date.now()}` : coverBase) : '';

  const addressFull = h(buildFullAddress(item));
  const socials = socialsRow({ ...(item.website ? { website: item.website } : {}), ...(item.socials || {}) });

  // Build nav tabs (About, Photos, Videos, Tryouts, optional Roster)
  const order = ['about','photos','videos','tryouts'];
  if (Array.isArray(item.rosterHandles) && item.rosterHandles.length) order.push('roster');

  const tabs = order.map((id,i) => {
    const title = id[0].toUpperCase() + id.slice(1);
    return `<a href="#${id}" ${i===0 ? 'aria-current="page"' : ''}>${title}</a>`;
  }).join('');

  containerEl.innerHTML = `
    <section class="hero card" style="max-width:980px;margin-inline:auto;overflow:hidden">
      ${cover ? `<img class="cover" src="${h(cover)}" alt="">` : ''}
      <div class="hero-inner container">
        <img class="avatar-ring" src="${h(logo)}" alt="${orgName} logo">
        <div class="hero-meta">
          <h1>${orgName}</h1>
          ${addressFull ? `<div class="handle">${addressFull}</div>` : ''}
          ${socials ? `<div class="social-row mt-2">${socials}</div>` : ''}
        </div>
      </div>
    </section>

    <section class="container" style="max-width:980px;margin-inline:auto">
      <nav class="tabs">
        <div class="tab-nav">
          ${tabs}
        </div>
      </nav>

      <!-- Sections: IDs match hrefs so clicks scroll to them -->
      <div id="about" class="mt-3 card" style="scroll-margin-top: 90px;">
        <h2 class="mt-0">About</h2>
        ${item.description ? `<p>${h(item.description).replace(/\n/g,'<br/>')}</p>` : `<p class="muted">No description yet.</p>`}
        <dl class="meta-list mt-2">
          ${addressFull ? `<dt>Address</dt><dd>${addressFull}</dd>` : ''}
          ${item.emailPublic ? `<dt>Email</dt><dd>${h(item.emailPublic)}</dd>` : ''}
          ${item.phonePublic ? `<dt>Phone</dt><dd>${h(item.phonePublic)}</dd>` : ''}
        </dl>
      </div>

      <div id="photos" class="mt-3 card" style="scroll-margin-top: 90px;">
        <h2 class="mt-0">Photos</h2>
        ${Array.isArray(item.mediaKeys) && item.mediaKeys.length ? `
          <div class="media-grid mt-2">
            ${item.mediaKeys.map(k => {
              const s = String(k || '');
              if (s.startsWith('raw/')) {
                return `<div class="media-card"><img src="/assets/image-processing.svg" alt="Processing…"></div>`;
              }
              return `<div class="media-card"><img src="${h(mediaUrl(s))}" alt=""></div>`;
            }).join('')}
          </div>` : `<p class="muted">No photos yet.</p>`}
      </div>

      <div id="videos" class="mt-3 card" style="scroll-margin-top: 90px;">
        <h2 class="mt-0">Videos</h2>
        ${Array.isArray(item.highlights) && item.highlights.length ? `
          <div class="media-grid mt-2">
            ${item.highlights.map(v => {
              const sv = String(v || '');
              const isYT = /youtube|youtu\.be/i.test(sv);
              const src = (sv.startsWith('public/') || sv.startsWith('raw/')) ? mediaUrl(sv) : sv;
              return `
                <div class="media-card">
                  ${isYT
                    ? `<iframe width="100%" height="220" src="${h(src).replace('watch?v=','embed/')}" title="Video" frameborder="0" allowfullscreen></iframe>`
                    : `<video src="${h(src)}" controls></video>`}
                </div>`;
            }).join('')}
          </div>
        ` : `<p class="muted">No videos yet.</p>`}
      </div>

      <div id="tryouts" class="mt-3 card" style="scroll-margin-top: 90px;">
        <h2 class="mt-0">Upcoming Tryouts</h2>
        ${renderTryoutList(tryouts)}
      </div>

      ${Array.isArray(item.rosterHandles) && item.rosterHandles.length ? `
        <div id="roster" class="mt-3 card" style="scroll-margin-top: 90px;">
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

  // Smooth scrolling + active link state
  const nav = containerEl.querySelector('.tab-nav');
  const links = Array.from(nav.querySelectorAll('a'));
  const sections = links
    .map(a => document.getElementById(a.getAttribute('href').replace('#','')))
    .filter(Boolean);

  // Smooth scroll on click
  links.forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = a.getAttribute('href').replace('#','');
      const target = document.getElementById(id);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        links.forEach(l => l.setAttribute('aria-current', l === a ? 'page' : 'false'));
        history.replaceState(null, '', `#${id}`);
      }
    });
  });

  // Highlight active link while scrolling
  const io = new IntersectionObserver((entries) => {
    let topMost = null;
    for (const entry of entries) {
      if (entry.isIntersecting) {
        if (!topMost || entry.boundingClientRect.top < topMost.boundingClientRect.top) {
          topMost = entry;
        }
      }
    }
    if (topMost) {
      const id = topMost.target.id;
      links.forEach(l => l.setAttribute('aria-current', l.getAttribute('href') === `#${id}` ? 'page' : 'false'));
    }
  }, { rootMargin: '-40% 0px -55% 0px', threshold: [0, 1] });

  sections.forEach(sec => io.observe(sec));
}

async function init(){
  const id = idFromPath();
  const containerEl = document.getElementById('pp-wrap');
  if (!containerEl) return;
  if (!id) { containerEl.innerHTML = '<p class="muted">Missing promotion id.</p>'; return; }
  try {
    const [item, tryouts] = await Promise.all([
      apiFetch(`/profiles/promoters/${encodeURIComponent(id)}`),
      apiFetch(`/promoters/${encodeURIComponent(id)}/tryouts`)
    ]);
    render(containerEl, item, tryouts);
  } catch (e){
    if (String(e).includes('API 401')) {
      containerEl.innerHTML = '<p class="muted">Please sign in to view this promotion.</p>';
      return;
    }
    containerEl.innerHTML = '<p class="muted">Could not load promotion.</p>';
    console.error(e);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
