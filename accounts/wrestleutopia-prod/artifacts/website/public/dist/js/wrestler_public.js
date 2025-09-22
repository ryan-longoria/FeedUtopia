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
      <div style="display:grid;grid-template-columns:160px 1fr;gap:16px">
        <img src="${img}" alt="${h(stage)}" style="width:160px;height:160px;border-radius:999px;object-fit:cover;background:#0f1224;border:1px solid #1f2546"/>
        <div>
          <h1 style="margin:0">${h(stage)}</h1>
          ${p.verified_school ? '<div class="mt-1"><span class="badge">Verified school</span></div>' : ''}
          <dl class="mt-2">${topMetaRows}</dl>
        </div>
      </div>

      <div class="mt-4">
        ${p.bio ? `<h2>Bio</h2><p>${h(p.bio).replace(/\n/g,'<br/>')}</p>` : ''}
      </div>

      <div class="grid cols-3 mt-4">
        ${expBlock}
        ${achBlock}
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
