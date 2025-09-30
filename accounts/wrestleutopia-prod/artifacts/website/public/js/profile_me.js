// /js/profile_me.js
import { apiFetch, uploadToS3 } from '/js/api.js';
import { getAuthState, isWrestler } from '/js/roles.js';
import { mediaUrl } from '/js/media.js';

// ---------- tiny DOM helpers ----------
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const setVal = (id, v = '') => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
const setImg = (sel, key) => { const el = $(sel); if (el) el.src = key ? mediaUrl(String(key)) : '/assets/avatar-fallback.svg'; };

// --- gallery state ---
let mediaKeys = [];     // photo keys for /w/ page (used by wrestler_public.js)
let highlights = [];    // URLs (YouTube or absolute MP4/HLS URLs)
const MEDIA_BASE = (window.WU_MEDIA_BASE || '').replace(/\/+$/, '');

function renderPhotoGrid() {
  const wrap = document.getElementById('photoGrid'); if (!wrap) return;
  wrap.innerHTML = (mediaKeys || []).map((k, i) => `
    <div class="media-card">
      <img src="${MEDIA_BASE ? `${MEDIA_BASE}/${k}` : '/assets/avatar-fallback.svg'}" alt="">
      <button class="btn secondary media-remove" type="button" data-i="${i}">Remove</button>
    </div>
  `).join('');
  wrap.querySelectorAll('.media-remove').forEach(btn => {
    btn.onclick = () => { mediaKeys.splice(Number(btn.dataset.i), 1); renderPhotoGrid(); };
  });
}

function renderHighlightList() {
  const ul = document.getElementById('highlightList'); if (!ul) return;
  ul.innerHTML = (highlights || []).map((u, i) => `
    <li>
      <span style="flex:1; word-break:break-all">${u}</span>
      <button class="btn secondary" type="button" data-i="${i}">Remove</button>
    </li>
  `).join('');
  ul.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => { highlights.splice(Number(btn.dataset.i), 1); renderHighlightList(); };
  });
}

// Back-compat wrapper if other code ever called photoUrlFromKey()
function photoUrlFromKey(key) { return key ? mediaUrl(String(key)) : '/assets/avatar-fallback.svg'; }

function toast(text, type = 'success') {
  const t = $('#toast');
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

/**
 * Reads the file input #avatar and uploads, returning the S3 key or null.
 * NOTE: #avatar is the <input type="file"> and #avatarPreview is the <img>
 */
async function uploadAvatarIfAny() {
  const fileInput = document.getElementById('avatar'); // <input type="file">
  const file = fileInput?.files?.[0];
  if (!file) return null;

  return await uploadAvatar(file); // -> "profiles/<sub>/avatar.<ext>"
}

async function loadMe() {
  try {
    const me = await apiFetch('/profiles/wrestlers/me');
    if (!me || !me.userId) return;

    mediaKeys = Array.isArray(me.mediaKeys) ? [...me.mediaKeys] : [];
    highlights = Array.isArray(me.highlights) ? [...me.highlights] : [];
    renderPhotoGrid();
    renderHighlightList();

    // Save to window for any legacy code that expects it
    window.profile = me;

    // Map of fields: API key -> input id
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

    // socials
    if (me.socials) {
      const s = me.socials;
      if (s.twitter)   setVal('social_twitter', s.twitter);
      if (s.instagram) setVal('social_instagram', s.instagram);
      if (s.tiktok)    setVal('social_tiktok', s.tiktok);
      if (s.youtube)   setVal('social_youtube', s.youtube);
      if (s.website)   setVal('social_website', s.website);
    }

    // text/number fields
    for (const [field, id] of Object.entries(map)) {
      if (me[field] !== undefined && me[field] !== null) setVal(id, me[field]);
    }

    // gimmicks array -> CSV field
    if (Array.isArray(me.gimmicks) && me.gimmicks.length) {
      setVal('gimmicks', me.gimmicks.join(', '));
    }

    // avatar preview
    setImg('#avatarPreview', me.photoKey || me.avatar_key || me.avatarKey || null);

    // enable "View" if we know the handle
    const vb = document.getElementById('viewBtn');
    if (vb) {
      vb.disabled = !me.handle;
      if (me.handle) vb.dataset.handle = me.handle;
    }
  } catch (e) {
    // 404 (no profile yet) is fine
    console.debug('loadMe:', e?.message || e);
  }
}

async function init() {
  const state = await ensureWrestler();
  if (!state) return;

  const form          = document.getElementById('profileForm');
  const saveBtn       = document.getElementById('saveBtn');
  const viewBtn       = document.getElementById('viewBtn');
  const avatarInput   = document.getElementById('avatar');        // <input type="file">
  const avatarPreview = document.getElementById('avatarPreview'); // <img>

  // live preview of avatar file selection
  avatarInput?.addEventListener('change', () => {
    const f = avatarInput.files?.[0];
    if (f && avatarPreview) avatarPreview.src = URL.createObjectURL(f);
  });

  viewBtn?.addEventListener('click', () => {
    const handle = viewBtn?.dataset?.handle;
    if (handle) {
      location.href = `/w/#${encodeURIComponent(handle)}`;
      return;
    }

    // Build a quick preview using current form values
    const stageName = $('#stageName')?.value || 'Wrestler';
    const first     = $('#firstName')?.value || '';
    const middle    = $('#middleName')?.value || '';
    const last      = $('#lastName')?.value || '';
    const fullName  = [first, middle, last].filter(Boolean).join(' ');

    const dob       = $('#dob')?.value || '';
    const city      = $('#city')?.value || '';
    const region    = $('#region')?.value || '';
    const country   = $('#country')?.value || '';
    const bio       = $('#bio')?.value || '';
    const gimmicks  = ($('#gimmicks')?.value || '').split(',').map(s => s.trim()).filter(Boolean);

    const imgSrc = avatarPreview?.src || '/assets/avatar-fallback.svg';
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

  // Add gallery photos (multi-upload)
  document.getElementById('addPhotosBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('photoFiles');
    const files = Array.from(input?.files || []);
    if (!files.length) return;
    for (const f of files) {
      const key = await uploadToS3(f.name, f.type || 'image/jpeg', f);
      mediaKeys.push(key);
    }
    renderPhotoGrid();
    input.value = '';
  });

  // Add highlight by URL
  document.getElementById('addHighlightUrlBtn')?.addEventListener('click', () => {
    const el = document.getElementById('highlightUrl');
    const u = (el?.value || '').trim();
    if (!u) return;
    highlights.push(u);
    renderHighlightList();
    el.value = '';
  });

  // Upload highlight video file
  document.getElementById('uploadHighlightBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('highlightFile');
    const f = input?.files?.[0];
    if (!f) return;
      const key = await uploadToS3(f.name, f.type || 'video/mp4', f);
      const absolute = MEDIA_BASE ? `${MEDIA_BASE}/${key}` : key;
      highlights.push(absolute);
    renderHighlightList();
    input.value = '';
  });


  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    setDisabled(saveBtn, true, 'Saving…');

    try {
      const data = formToObj(form);

      // Upload avatar first (optional)
      const key = await uploadAvatarIfAny().catch(() => null);
      if (key) data.photoKey = key;

      // PUT to backend
      const payload = {
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
        mediaKeys,
        highlights,
      };

      const saved = await apiFetch('/profiles/wrestlers/me', { method: 'PUT', body: payload });

      toast('Profile saved!');

      // Update "View" button & avatar preview
      if (saved?.handle && viewBtn) {
        viewBtn.disabled = false;
        viewBtn.dataset.handle = saved.handle;
        viewBtn.onclick = () => { location.href = `/w/#${encodeURIComponent(saved.handle)}`; };
      }
      if ((saved?.photoKey || data.photoKey) && avatarPreview) {
        avatarPreview.src = photoUrlFromKey(saved?.photoKey || data.photoKey);
      }
    } catch (err) {
      console.error(err);
      toast(err?.message || 'Save failed', 'error');
    } finally {
      setDisabled(saveBtn, false);
    }
  });

  await loadMe();
}

// Ensure DOM exists before running
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
