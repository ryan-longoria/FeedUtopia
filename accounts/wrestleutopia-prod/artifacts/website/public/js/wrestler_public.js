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

function fmtHeight(inches) {
  const n = Math.round(Number(inches));
  if (!Number.isFinite(n) || n <= 0) return null;
  const ft = Math.floor(n / 12);
  const inch = n % 12;
  return `${ft}'${inch}"`;
}
function fmtWeight(lb) {
  const n = Number(lb);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${n} lb`;
}
function safeLink(url, label) {
  const u = String(url || '').trim();
  try {
    const parsed = new URL(u, location.origin);
    if (!/^https?:$/.test(parsed.protocol)) return '';
  } catch { return ''; }
  const escLabel = h(label || u);
  const escUrl = h(u);
  return `<a href="${escUrl}" target="_blank" rel="noopener nofollow">${escLabel}</a>`;
}

async function run() {
  const wrap = document.getElementById('wp-wrap');
  const handle = (location.hash || '').replace(/^#/, '').trim();
  if (!handle) { wrap.innerHTML = '<div class="card"><h2>Profile not found</h2></div>'; return; }

  try {
    const p = await apiFetch(`/profiles/wrestlers/${encodeURIComponent(handle)}`);

    const stage = p.stageName || p.ring || p.name || handle;
    const name  = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(' ');
    const loc   = [p.city, p.region, p.country].filter(Boolean).join(' - ');
    const img   = objUrlFromKey(p.photoKey);
    const chips = Array.isArray(p.gimmicks) ? p.gimmicks : [];
    const htStr = fmtHeight(p.heightIn);
    const wtStr = fmtWeight(p.weightLb);

    document.title = `${stage} – WrestleUtopia`;

    // socials
    const socials = p.socials || {};
    const socialLinks = [
      socials.website   ? safeLink(socials.website, 'Website')     : '',
      socials.twitter   ? safeLink(socials.twitter, 'Twitter')     : '',
      socials.instagram ? safeLink(socials.instagram, 'Instagram') : '',
      socials.tiktok    ? safeLink(socials.tiktok, 'TikTok')       : '',
      socials.youtube   ? safeLink(socials.youtube, 'YouTube')     : '',
    ].filter(Boolean).join(' • ');

    const topMetaRows = [
      name ? `<dt class="muted">Name</dt><dd>${h(name)}</dd>` : '',
      p.dob ? `<dt class="muted mt-2">DOB</dt><dd>${h(p.dob)}</dd>` : '',
      loc ? `<dt class="muted mt-2">Location</dt><dd>${h(loc)}</dd>` : '',
      (htStr || wtStr) ? `<dt class="muted mt-2">Vitals</dt><dd>${[htStr, wtStr].filter(Boolean).join(' • ')}</dd>` : '',
      chips.length ? `<dt class="muted mt-2">Gimmicks</dt><dd>${chips.map(c=>`<span class="chip">${h(c)}</span>`).join(' ')}</dd>` : '',
      socialLinks ? `<dt class="muted mt-2">Socials</dt><dd>${socialLinks}</dd>` : '',
    ].join('');

    const expBlock = (p.experienceYears != null)
      ? `<div class="card"><h3>Experience</h3><p class="muted">${p.experienceYears} year${p.experienceYears === 1 ? '' : 's'}</p></div>`
      : '';

    const achBlock = p.achievements
      ? `<div class="card"><h3>Achievements</h3><p>${h(p.achievements)}</p></div>`
      : '';

    wrap.innerHTML = `
      <section class="hero card" style="max-width:980px;margin-inline:auto;overflow:hidden">
        ${p.coverKey ? `<img class="cover" src="${objUrlFromKey(p.coverKey)}" alt="">` : ''}
        <div class="hero-inner container">
          <img class="avatar-ring" src="${img}" alt="${h(stage)} avatar">

          <div class="hero-meta">
            <h1>${h(stage)}</h1>
            <div class="handle">@${h(handle)}</div>
            <div class="stats-bar">
              ${loc ? `<span class="pill">${h(loc)}</span>` : ''}
              ${htStr ? `<span class="pill">${htStr}</span>` : ''}
              ${wtStr ? `<span class="pill">${wtStr}</span>` : ''}
              ${Number.isFinite(+p.experienceYears) ? `<span class="pill">${p.experienceYears} yr experience</span>` : ''}
              ${Array.isArray(chips) && chips.length ? `<span class="pill">${h(chips.slice(0,3).join(' • '))}</span>` : ''}
            </div>

            <div class="action-bar">
              <a class="btn primary small" href="/tryouts.html#new?talent=${encodeURIComponent(handle)}">Book a Tryout</a>
              <button class="btn ghost small" id="msgBtn">Message</button>
              <button class="btn ghost small" id="shareBtn">Share</button>
            </div>

            ${socialLinks ? `<div class="social-row mt-2">${socialLinks}</div>` : ''}
          </div>
        </div>
      </section>

      <section class="container" style="max-width:980px;margin-inline:auto">
        <nav class="tabs">
          <div class="tab-nav">
            <a href="#about" aria-current="page">About</a>
            <a href="#highlights">Highlights</a>
            <a href="#photos">Photos</a>
            ${p.achievements ? `<a href="#achievements">Achievements</a>` : ''}
          </div>
        </nav>

        <div id="tab-about" class="mt-3 card">
          <h2 class="mt-0">About</h2>
          ${p.bio ? `<p>${h(p.bio).replace(/\n/g,'<br/>')}</p>` : `<p class="muted">No bio yet.</p>`}
          <dl class="meta-list mt-2">
            ${name ? `<dt>Name</dt><dd>${h(name)}</dd>` : ''}
            ${p.emailPublic ? `<dt>Email</dt><dd>${h(p.emailPublic)}</dd>` : ''}
            ${(p.phonePublic) ? `<dt>Phone</dt><dd>${h(p.phonePublic)}</dd>` : ''}
            ${p.styles ? `<dt>Style</dt><dd>${h(p.styles)}</dd>` : ''}
            ${p.gimmicks?.length ? `<dt>Gimmicks</dt><dd>${p.gimmicks.map(c=>`<span class="chip">${h(c)}</span>`).join(' ')}</dd>` : ''}
          </dl>
        </div>

        <div id="tab-highlights" class="mt-3">
          ${Array.isArray(p.highlights) && p.highlights.length ? `
            <div class="media-grid">
              ${p.highlights.map(v => `
                <div class="media-card">
                  ${/youtube|youtu\.be/i.test(v) ? 
                    `<iframe width="100%" height="220" src="${h(v).replace('watch?v=','embed/')}" title="Highlight" frameborder="0" allowfullscreen></iframe>` :
                    `<video src="${h(v)}" controls></video>`
                  }
                </div>`).join('')}
            </div>
          ` : `<div class="card"><p class="muted">No highlight videos yet.</p></div>`}
        </div>

        <div id="tab-photos" class="mt-3">
          ${Array.isArray(p.mediaKeys) && p.mediaKeys.length ? `
            <div class="media-grid">
              ${p.mediaKeys.map(k => `<div class="media-card"><img src="${objUrlFromKey(k)}" alt=""></div>`).join('')}
            </div>
          ` : `<div class="card"><p class="muted">No photos yet.</p></div>`}
        </div>

        ${p.achievements ? `
          <div id="tab-achievements" class="mt-3 card">
            <h2 class="mt-0">Achievements</h2>
            <p>${h(p.achievements).replace(/\n/g,'<br/>')}</p>
          </div>
        ` : ''}

      </section>
    `;

  } catch (e) {
    console.error(e);
    wrap.innerHTML = `<div class="card"><h2>Profile not found</h2><p class="muted">We couldn’t load @${h(handle)}.</p></div>`;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', run);
} else { run(); }
