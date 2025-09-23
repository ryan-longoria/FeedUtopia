// /js/promo_me.js
import { apiFetch, uploadToS3 } from '/js/api.js';
import { getAuthState, isPromoter } from '/js/roles.js';

// ---------- tiny DOM helpers ----------
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const setVal = (id, v = '') => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
const getVal = (id) => (document.getElementById(id)?.value ?? '').trim();
const setDisabled = (el, on, labelBusy = 'Saving…') => {
  if (!el) return;
  el.disabled = !!on;
  if (on) {
    el.dataset.prevText = el.textContent;
    el.textContent = labelBusy;
  } else {
    el.textContent = el.dataset.prevText || el.textContent;
  }
};

function toast(text, type = 'success') {
  const t = document.querySelector('#toast');
  if (!t) return console[type === 'error' ? 'error' : 'log'](text);
  t.textContent = text;
  t.classList.toggle('error', type === 'error');
  t.style.display = 'block';
  setTimeout(() => (t.style.display = 'none'), 2400);
}

// ---------- media helpers (logos/photos/videos) ----------
const MEDIA_BASE = (window.WU_MEDIA_BASE || '').replace(/\/+$/, '');

function mediaUrlFromKey(key, fallback = '/assets/avatar-fallback.svg') {
  if (!key) return fallback;
  if (String(key).startsWith('http')) return key;
  return MEDIA_BASE ? `${MEDIA_BASE}/${key}` : fallback;
}

// State for gallery (photos) + highlights (video links or absolute URLs)
let mediaKeys = [];   // array of S3 object keys (images)
let highlights = [];  // array of URLs (YouTube or absolute video URLs)

function renderPhotoGrid() {
  const wrap = document.getElementById('photoGrid'); if (!wrap) return;
  wrap.innerHTML = (mediaKeys || []).map((k, i) => `
    <div class="media-card">
      <img src="${mediaUrlFromKey(k)}" alt="">
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

async function uploadLogoIfAny() {
  const file = document.getElementById('logo')?.files?.[0];
  if (!file) return null;
  const s3 = await uploadToS3(file.name, file.type || 'image/jpeg', file); // returns s3://bucket/key
  const key = String(s3).replace(/^s3:\/\//, '');
  return key; // store as key only; public pages resolve via MEDIA_BASE
}

// ---------- auth gate ----------
async function ensurePromoter() {
  const state = await getAuthState();
  if (!state || !isPromoter(state)) {
    toast('Please sign in as a promoter.', 'error');
    return null;
  }
  document.body.classList.add('authenticated');
  return state;
}

// ---------- load existing profile ----------
async function loadMe() {
  try {
    const me = await apiFetch('/profiles/promoters/me', { method: 'GET' });

    // Core fields
    setVal('orgName', me.orgName);
    setVal('address', me.address);
    setVal('city', me.city);
    setVal('region', me.region);
    setVal('country', me.country);
    setVal('website', me.website);
    setVal('contact', me.contact);
    setVal('bio', me.bio);

    // Socials (if your inputs exist)
    if (me.socials && typeof me.socials === 'object') {
      for (const [k, v] of Object.entries(me.socials)) {
        setVal(k, v);
      }
    }

    // Logo preview
    const logoImg = document.getElementById('logoPreview');
    if (logoImg) logoImg.src = mediaUrlFromKey(me.logoKey);

    // Gallery + Highlights
    mediaKeys = Array.isArray(me.mediaKeys) ? [...me.mediaKeys] : [];
    highlights = Array.isArray(me.highlights) ? [...me.highlights] : [];
    renderPhotoGrid();
    renderHighlightList();

  } catch (e) {
    // 404/empty is fine for first-time users
    console.debug('loadMe:', e.message || e);
  }
}

// ---------- init & events ----------
async function init() {
  const state = await ensurePromoter();
  if (!state) return;

  // Live logo preview
  const logoInput = document.getElementById('logo');
  const logoPreview = document.getElementById('logoPreview');
  logoInput?.addEventListener('change', () => {
    const f = logoInput.files?.[0];
    if (!f || !logoPreview) return;
    logoPreview.src = URL.createObjectURL(f);
  });

  // Add gallery photos (multi-upload)
  document.getElementById('addPhotosBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('photoFiles');
    const files = Array.from(input?.files || []);
    if (!files.length) return;

    try {
      for (const f of files) {
        const s3 = await uploadToS3(f.name, f.type || 'image/jpeg', f);
        let key = String(s3).replace(/^s3:\/\//, '');
        const slash = key.indexOf('/'); if (slash >= 0) key = key.slice(slash + 1);
        mediaKeys.push(key);
      }
      renderPhotoGrid();
      input.value = '';
    } catch (err) {
      console.error(err);
      toast('Photo upload failed', 'error');
    }
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

    try {
      const s3 = await uploadToS3(f.name, f.type || 'video/mp4', f);
      let key = String(s3).replace(/^s3:\/\//, '');
      const slash = key.indexOf('/'); if (slash >= 0) key = key.slice(slash + 1);
      const absolute = MEDIA_BASE ? `${MEDIA_BASE}/${key}` : key; // public page expects full URL for videos
      highlights.push(absolute);
      renderHighlightList();
      input.value = '';
    } catch (err) {
      console.error(err);
      toast('Video upload failed', 'error');
    }
  });

  // Save handler
  const form = document.getElementById('promoForm');
  const saveBtn = document.getElementById('saveBtn');

  form?.addEventListener('submit', async (evt) => {
    evt.preventDefault();
    setDisabled(saveBtn, true);

    try {
      // collect core fields
      const data = {
        orgName: getVal('orgName'),
        address: getVal('address'),
        city: getVal('city'),
        region: getVal('region'),
        country: getVal('country'),
        website: getVal('website'),
        contact: getVal('contact'),
        bio: getVal('bio'),
      };

      // socials if present
      const socialIds = ['twitter','instagram','facebook','tiktok','youtube'];
      const socials = {};
      socialIds.forEach(id => { const v = getVal(id); if (v) socials[id] = v; });
      if (Object.keys(socials).length) data.socials = socials;

      // upload logo if provided
      const logoKey = await uploadLogoIfAny();
      if (logoKey) data.logoKey = logoKey;

      // attach gallery + highlights
      data.mediaKeys = mediaKeys;
      data.highlights = highlights;

      // Save
      const saved = await apiFetch('/profiles/promoters', {
        method: 'PUT',
        body: data,
      });

      toast('Promotion saved!');
      // refresh preview/preview button if you have one
      // (no-op by default)

      // Ensure preview reflects any new logo immediately
      if (saved?.logoKey && logoPreview) {
        logoPreview.src = mediaUrlFromKey(saved.logoKey);
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
