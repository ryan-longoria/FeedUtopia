// /js/profile_me.js
import { apiFetch, uploadToS3 } from '/js/api.js';
import { getAuthState, isWrestler } from '/js/roles.js';

const MEDIA_BASE = (window.WU_MEDIA_BASE || '').replace(/\/+$/, ''); // optional, e.g., https://cdn.wrestleutopia.com

function toast(text, type = 'success') {
  const t = document.querySelector('#toast');
  if (!t) return console.log(text);
  t.textContent = text;
  t.classList.toggle('error', type === 'error');
  t.style.display = 'block';
  setTimeout(() => (t.style.display = 'none'), 2400);
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function ensureWrestler() {
  const s = await getAuthState();
  if (!isWrestler(s)) {
    toast('Wrestler role required', 'error');
    location.replace('index.html');
    return null;
  }
  return s;
}

function formToObj(form) {
  const fd = new FormData(form);
  const o = {};
  for (const [k, v] of fd.entries()) o[k] = v;

  // required numeric
  o.heightIn = Number(o.heightIn || NaN);
  o.weightLb = Number(o.weightLb || NaN);

  // optionals
  o.bio = (o.bio || '').trim() || null;
  o.gimmicks = (o.gimmicks || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

  // socials map
  o.socials = {
    twitter:   (o.social_twitter || '').trim() || null,
    instagram: (o.social_instagram || '').trim() || null,
    tiktok:    (o.social_tiktok || '').trim() || null,
    youtube:   (o.social_youtube || '').trim() || null,
    website:   (o.social_website || '').trim() || null,
  };
  // remove empties
  Object.keys(o.socials).forEach(k => { if (!o.socials[k]) delete o.socials[k]; });

  // numbers (optional)
  o.experienceYears = (o.experienceYears || '').toString().trim() === '' ? null : Number(o.experienceYears);
  o.achievements = (o.achievements || '').trim() || null;

  return o;
}

function setDisabled(el, on, labelBusy) {
  if (!el) return;
  el.disabled = !!on;
  if (labelBusy) {
    const prev = el.dataset.prevText || el.textContent;
    if (on) { el.dataset.prevText = prev; el.textContent = labelBusy; }
    else { el.textContent = el.dataset.prevText || el.textContent; }
  }
}

function photoUrlFromKey(key) {
  if (!key) return '/assets/avatar-fallback.svg';
  if (MEDIA_BASE) return `${MEDIA_BASE}/${key}`;
  // If you later put CloudFront behind your S3 bucket, set window.WU_MEDIA_BASE to that domain.
  return '/assets/avatar-fallback.svg';
}

async function uploadAvatarIfAny() {
  const file = document.getElementById('avatar')?.files?.[0];
  if (!file) return null;

  const s3uri = await uploadToS3(file.name, file.type || 'image/jpeg', file);
  const key = s3uri.replace(/^s3:\/\//, '');
  return key;
}

async function loadMe() {
  try {
    const me = await apiFetch('/profiles/wrestlers/me');
    if (!me || !me.userId) return;

    // fill fields if present
    const map = {
      firstName: 'firstName',
      middleName: 'middleName',
      lastName: 'lastName',
      stageName: 'stageName',
      dob: 'dob',
      city: 'city',
      region: 'region',
      country: 'country',
      heightIn: 'heightIn',
      weightLb: 'weightLb',
      bio: 'bio',
      experienceYears: 'experienceYears',
      achievements: 'achievements',
    };
    if (me.socials) {
      const s = me.socials;
      if (s.twitter)   document.getElementById('social_twitter').value   = s.twitter;
      if (s.instagram) document.getElementById('social_instagram').value = s.instagram;
      if (s.tiktok)    document.getElementById('social_tiktok').value    = s.tiktok;
      if (s.youtube)   document.getElementById('social_youtube').value   = s.youtube;
      if (s.website)   document.getElementById('social_website').value   = s.website;
    }
    for (const [field, id] of Object.entries(map)) {
      if (me[field]) document.getElementById(id).value = me[field];
    }
    if (Array.isArray(me.gimmicks) && me.gimmicks.length) {
      document.getElementById('gimmicks').value = me.gimmicks.join(', ');
    }
    const img = document.getElementById('avatarPreview');
    if (img) img.src = photoUrlFromKey(me.photoKey);
    // enable "View" if we know the handle
    document.getElementById('viewBtn').disabled = !me.handle;
    if (me.handle) document.getElementById('viewBtn').dataset.handle = me.handle;
  } catch (e) {
    // 404 (no profile yet) is fine
    console.debug('loadMe:', e.message || e);
  }
}

async function init() {
  const state = await ensureWrestler();
  if (!state) return;

  const form = document.getElementById('profileForm');
  const saveBtn = document.getElementById('saveBtn');
  const viewBtn = document.getElementById('viewBtn');
  const avatarInput = document.getElementById('avatar');
  const avatarPreview = document.getElementById('avatarPreview');

  // live preview of avatar
  avatarInput?.addEventListener('change', () => {
    const f = avatarInput.files?.[0];
    if (f) avatarPreview.src = URL.createObjectURL(f);
  });

  viewBtn?.addEventListener('click', () => {
    const handle = viewBtn?.dataset?.handle;
    if (handle) { 
      location.href = `/w/#${encodeURIComponent(handle)}`
      return;
    }

    const stageName = document.getElementById('stageName')?.value || 'Wrestler';
    const first     = document.getElementById('firstName')?.value || '';
    const middle    = document.getElementById('middleName')?.value || '';
    const last      = document.getElementById('lastName')?.value || '';
    const fullName  = [first, middle, last].filter(Boolean).join(' ');

    const dob       = document.getElementById('dob')?.value || '';
    const city      = document.getElementById('city')?.value || '';
    const region    = document.getElementById('region')?.value || '';
    const country   = document.getElementById('country')?.value || '';
    const bio       = document.getElementById('bio')?.value || '';
    const gimmicks  = (document.getElementById('gimmicks')?.value || '')
                        .split(',').map(s=>s.trim()).filter(Boolean);

    const imgSrc = document.getElementById('avatarPreview')?.src || '/assets/avatar-fallback.svg';
    const loc = [city, region, country].filter(Boolean).join(', ');

    const html = `
      <div style="display:grid;grid-template-columns:120px 1fr;gap:16px">
        <img src="${imgSrc}" alt="Avatar" style="width:120px;height:120px;border-radius:999px;object-fit:cover;background:#0f1224;border:1px solid #1f2546"/>
        <div>
          <h2 style="margin:0">${stageName}</h2>
          <div class="muted">${loc}</div>
          <div class="chips mt-2">${gimmicks.map(g=>`<span class="chip">${g}</span>`).join('')}</div>
        </div>
      </div>
      <div class="mt-3">${bio ? `<p>${bio.replace(/\n/g,'<br/>')}</p>` : '<p class="muted">No bio yet.</p>'}</div>
      <dl class="mt-3">
        <dt class="muted">Name</dt><dd>${fullName}</dd>
        <dt class="muted mt-2">DOB</dt><dd>${dob}</dd>
      </dl>
    `;
    const box = document.getElementById('preview-content');
    if (box) box.innerHTML = html;
    document.getElementById('preview-modal')?.showModal();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setDisabled(saveBtn, true, 'Saving…');

    try {
      const data = formToObj(form);
      // Try uploading avatar first (optional)
      const key = await uploadAvatarIfAny().catch(() => null);
      if (key) data.photoKey = key;

      // Send to backend
      const saved = await apiFetch('/profiles/wrestlers/me', {
        method: 'PUT',
        body: {
          // required
          stageName: data.stageName,
          firstName: data.firstName,
          middleName: data.middleName || null,
          lastName: data.lastName,
          dob: data.dob,
          city: data.city,
          region: data.region,
          country: data.country,
          heightIn: data.heightIn,
          weightLb: data.weightLb,

          // optional
          bio: data.bio,
          gimmicks: data.gimmicks,
          socials: data.socials,
          experienceYears: data.experienceYears,
          achievements: data.achievements,

          // media
          photoKey: data.photoKey || null,
        },
      });
      toast('Profile saved!');
      // Update "View" button & avatar preview
      if (saved?.handle) {
        const btn = document.getElementById('viewBtn');
        if (btn) {
          btn.disabled = false;
          btn.dataset.handle = saved.handle;
          btn.onclick = () => { location.href = `/w/#${encodeURIComponent(saved.handle)}`; };
        }
      }
      if (saved?.photoKey && avatarPreview) {
        avatarPreview.src = photoUrlFromKey(saved.photoKey);
      }
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
