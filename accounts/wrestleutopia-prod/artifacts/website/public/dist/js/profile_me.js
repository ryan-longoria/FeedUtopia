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
  // normalize optionals
  o.bio = (o.bio || '').trim() || null;
  o.gimmicks = (o.gimmicks || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
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
      name: 'name',
      stageName: 'stageName',
      dob: 'dob',
      city: 'city',
      region: 'region',
      country: 'country',
      bio: 'bio',
    };
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
    const handle =
      viewBtn.dataset.handle ||
      slugify(document.getElementById('stageName')?.value || '');
    if (!handle) return;
    // prefer pretty URL (/w/<handle>) — /w/index.html handles routing
    location.href = `/w/${handle}`;
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
      const saved = await apiFetch('/profiles/wrestlers', {
        method: 'POST',
        body: {
          name: data.name,
          stageName: data.stageName,
          dob: data.dob,
          city: data.city,
          region: data.region || null,
          country: data.country,
          bio: data.bio,
          gimmicks: data.gimmicks,
          photoKey: data.photoKey || null,
        },
      });

      toast('Profile saved!');
      // Update "View" button & avatar preview
      if (saved?.handle) {
        viewBtn.disabled = false;
        viewBtn.dataset.handle = saved.handle;
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
