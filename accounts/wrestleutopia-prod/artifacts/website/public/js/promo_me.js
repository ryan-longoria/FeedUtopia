// /js/promo_me.js
import { apiFetch, uploadToS3 } from '/js/api.js';
import { getAuthState, isPromoter } from '/js/roles.js';

const MEDIA_BASE = (window.WU_MEDIA_BASE || '').replace(/\/+$/, '');

function toast(text, type = 'success') {
  const t = document.querySelector('#toast');
  if (!t) return console[type==='error'?'error':'log'](text);
  t.textContent = text;
  t.classList.toggle('error', type === 'error');
  t.style.display = 'block';
  setTimeout(() => (t.style.display = 'none'), 2400);
}

async function ensurePromoter() {
  const s = await getAuthState();
  if (!isPromoter(s)) {
    toast('Promoter role required', 'error');
    location.replace('/');
    return null;
  }
  return s;
}

function formToObj(form) {
  const fd = new FormData(form);
  const o = {};
  for (const [k, v] of fd.entries()) o[k] = v;

  // required
  o.orgName = (o.orgName || '').trim();
  o.address = (o.address || '').trim();

  // optionals / legacy location pieces
  o.city    = (o.city || '').trim() || null;
  o.region  = (o.region || '').trim() || null;
  o.country = (o.country || '').trim() || null;

  o.website = (o.website || '').trim() || null;
  o.contact = (o.contact || '').trim() || null;
  o.bio     = (o.bio || '').trim() || null;

  // socials map
  const socials = {
    twitter:   (o.social_twitter || '').trim() || null,
    instagram: (o.social_instagram || '').trim() || null,
    tiktok:    (o.social_tiktok || '').trim() || null,
    youtube:   (o.social_youtube || '').trim() || null,
    facebook:  (o.social_facebook || '').trim() || null,
    website:   o.website || null, // keep also at top-level for convenience
  };
  Object.keys(socials).forEach(k => { if (!socials[k]) delete socials[k]; });
  o.socials = Object.keys(socials).length ? socials : null;

  return o;
}

function setDisabled(el, on, busy) {
  if (!el) return;
  el.disabled = !!on;
  if (busy) {
    const prev = el.dataset.prevText || el.textContent;
    if (on) { el.dataset.prevText = prev; el.textContent = busy; }
    else { el.textContent = el.dataset.prevText || el.textContent; }
  }
}

function mediaUrl(key) {
  if (!key) return '/assets/avatar-fallback.svg';
  return MEDIA_BASE ? `${MEDIA_BASE}/${key}` : '/assets/avatar-fallback.svg';
}

async function uploadLogoIfAny() {
  const f = document.getElementById('logo')?.files?.[0];
  if (!f) return null;
  const s3uri = await uploadToS3(f.name, f.type || 'image/jpeg', f);
  return s3uri.replace(/^s3:\/\//, '');
}

async function loadMe() {
  try {
    const me = await apiFetch('/profiles/promoters/me'); // GET current user's promoter profile
    if (!me || !me.userId) return;

    const map = {
      orgName: 'orgName',
      address: 'address',
      city: 'city',
      region: 'region',
      country: 'country',
      website: 'website',
      contact: 'contact',
      bio: 'bio',
    };
    if (me.socials) {
      const s = me.socials;
      if (s.twitter)   document.getElementById('social_twitter').value   = s.twitter;
      if (s.instagram) document.getElementById('social_instagram').value = s.instagram;
      if (s.tiktok)    document.getElementById('social_tiktok').value    = s.tiktok;
      if (s.youtube)   document.getElementById('social_youtube').value   = s.youtube;
      if (s.facebook)  document.getElementById('social_facebook').value  = s.facebook;
    }
    for (const [field, id] of Object.entries(map)) {
      if (me[field]) document.getElementById(id).value = me[field];
    }
    const img = document.getElementById('logoPreview');
    if (img) img.src = mediaUrl(me.logoKey);
  } catch (e) {
    // 404/empty is fine for first-time users
    console.debug('loadMe:', e.message || e);
  }
}

async function init() {
  const state = await ensurePromoter();
  if (!state) return;

  const form = document.getElementById('promoForm');
  const saveBtn = document.getElementById('saveBtn');
  const viewBtn = document.getElementById('viewBtn');
  const logoInput = document.getElementById('logo');
  const logoPreview = document.getElementById('logoPreview');

  // live logo preview
  logoInput?.addEventListener('change', () => {
    const f = logoInput.files?.[0];
    if (f) logoPreview.src = URL.createObjectURL(f);
  });

  // Preview modal
  viewBtn?.addEventListener('click', () => {
    if (state?.sub) {
      location.href = `/p/${encodeURIComponent(state.sub)}`;
      return;
    }
    const orgName = document.getElementById('orgName')?.value || 'Your Promotion';
    const city    = document.getElementById('city')?.value || '';
    const region  = document.getElementById('region')?.value || '';
    const country = document.getElementById('country')?.value || '';
    const website = document.getElementById('website')?.value || '';
    const contact = document.getElementById('contact')?.value || '';
    const bio     = document.getElementById('bio')?.value || '';

    const imgSrc = document.getElementById('logoPreview')?.src || '/assets/avatar-fallback.svg';
    const loc = [city, region, country].filter(Boolean).join(', ');

    const html = `
      <div style="display:grid;grid-template-columns:120px 1fr;gap:16px">
        <img src="${imgSrc}" alt="Logo" style="width:120px;height:120px;border-radius:16px;object-fit:cover;background:#0f1224;border:1px solid #1f2546"/>
        <div>
          <h2 style="margin:0">${orgName}</h2>
          <div class="muted">${loc}</div>
          <div class="mt-2">
            ${website ? `<a href="${website}" target="_blank" rel="noopener">Website</a>` : ''}
            ${website && contact ? ' • ' : ''}
            ${contact ? `<span>${contact}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="mt-3">${bio ? `<p>${bio.replace(/\n/g,'<br/>')}</p>` : '<p class="muted">No bio yet.</p>'}</div>
    `;
    const box = document.getElementById('preview-content');
    if (box) box.innerHTML = html;
    document.getElementById('preview-modal')?.showModal();
  });

  // Save
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setDisabled(saveBtn, true, 'Saving…');
    try {
      const data = formToObj(form);
      if (!data.orgName || !data.address) {
        toast('Promotion name and full address are required', 'error');
        return;
      }

      const key = await uploadLogoIfAny().catch(() => null);
      if (key) data.logoKey = key;

      const saved = await apiFetch('/profiles/promoters', {
        method: 'PUT',
        body: {
          orgName: data.orgName,
          address: data.address,      // <-- required
          city: data.city,
          region: data.region,
          country: data.country,
          website: data.website,
          contact: data.contact,
          bio: data.bio,
          socials: data.socials,      // <-- new
          logoKey: data.logoKey || null,
        },
      });

      toast('Promotion saved!');
      if (saved?.logoKey && logoPreview) logoPreview.src = mediaUrl(saved.logoKey);
    } catch (err) {
      console.error(err);
      toast(err.message || 'Save failed', 'error');
    } finally {
      setDisabled(saveBtn, false);
    }
  });

  await loadMe();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
