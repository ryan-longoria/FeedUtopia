// forms.js
import { apiFetch } from '/js/api.js';
import { getAuthState, isPromoter, isWrestler } from '/js/roles.js';

// Read groups directly off the ID token (used in a couple places)
async function userGroups() {
  try {
    const { fetchAuthSession } = await import('/js/auth-bridge.js');
    const s = await fetchAuthSession();
    const id = s?.tokens?.idToken?.toString();
    if (!id) return [];
    const payload = JSON.parse(atob(id.split('.')[1]));
    const g = payload['cognito:groups'];
    return Array.isArray(g) ? g : (typeof g === 'string' && g ? [g] : []);
  } catch {
    return [];
  }
}

// ⚠️ renamed to avoid clashing with imports from roles.js
const isPromoterGroup = (groups) => groups.includes('Promoters');
const isWrestlerGroup = (groups) => groups.includes('Wrestlers');

function serializeForm(form) {
  const data = new FormData(form);
  const obj = {};
  for (const [k, v] of data.entries()) {
    if (obj[k]) {
      if (Array.isArray(obj[k])) obj[k].push(v);
      else obj[k] = [obj[k], v];
    } else {
      obj[k] = v;
    }
  }
  return obj;
}

function toast(text, type = 'success') {
  const t = document.querySelector('#toast');
  if (!t) { if (type==='error') console.error(text); else console.log(text); return; }
  t.textContent = text;
  t.classList.toggle('error', type === 'error');
  t.style.display = 'block';
  setTimeout(() => (t.style.display = 'none'), 2600);
}
window.toast = toast;

function renderTalent(list) {
  const target = document.querySelector('#talent-list');
  if (!target) return;

  const items = Array.isArray(list) ? list : (list ? [list] : []);
  target.innerHTML = '';

  const fallback = (ring) => `https://picsum.photos/seed/${encodeURIComponent(ring)}/200/200`;

  items.forEach((p, idx) => {
    const ring = p.ring || p.ringName || p.stageName || p.name || 'Wrestler';
    const name = p.name || '';
    const yrs  = p.years ?? p.yearsExperience ?? 0;
    const styles = Array.isArray(p.styles) ? p.styles : (Array.isArray(p.gimmicks) ? p.gimmicks : []);
    const city = [p.city, p.region, p.country].filter(Boolean).join(', ');
    const rateMin = p.rate_min ?? p.rateMin ?? 0;
    const rateMax = p.rate_max ?? p.rateMax ?? 0;
    const verified = !!p.verified_school || !!p.verifiedSchool;
    const reel = p.reel || p.reelLink || '#';
    const avatar =
      (p.photoKey && window.WU_MEDIA_BASE ? `${window.WU_MEDIA_BASE}/${p.photoKey}` : p.avatar) || fallback(ring);

    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<div class="profile">
      <img src="${avatar}" alt="${ring} profile"/>
      <div class="info">
        <div><strong>${ring}</strong> <span class="muted">(${name})</span></div>
        <div class="mt-2">${city || '—'} • ${yrs} yrs • ${styles.join(', ')}</div>
        <div class="mt-2">${verified ? '<span class="badge">Verified school</span>' : ''}</div>
        <div class="mt-2 muted">Rate: $${rateMin}-${rateMax}</div>
        <div class="mt-3" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn small view-profile-btn" type="button">View Profile</button>
          ${p.handle ? `<a class="btn small secondary" href="/w/#${encodeURIComponent(p.handle)}">See Full Profile</a>` : ''}
        </div>
      </div>
    </div>`;

    // Open modal with full profile details
    el.querySelector('.view-profile-btn')?.addEventListener('click', () => {
      const html = `
        <div style="display:grid;grid-template-columns:120px 1fr;gap:16px">
          <img src="${avatar}" alt="Avatar" style="width:120px;height:120px;border-radius:999px;object-fit:cover;background:#0f1224;border:1px solid #1f2546"/>
          <div>
            <h2 style="margin:0">${ring}</h2>
            <div class="muted">${city || ''}</div>
            <div class="chips mt-2">${styles.map(g=>`<span class="chip">${g}</span>`).join('')}</div>
          </div>
        </div>
        <div class="mt-3">
          ${p.bio ? `<p>${String(p.bio).replace(/\n/g,'<br/>')}</p>` : '<p class="muted">No bio yet.</p>'}
        </div>
        <dl class="mt-3">
          <dt class="muted">Name</dt><dd>${name}</dd>
          ${p.dob ? `<dt class="muted mt-2">DOB</dt><dd>${p.dob}</dd>` : ''}
          ${verified ? `<dt class="muted mt-2">School</dt><dd>Verified</dd>` : ''}
        </dl>
        ${reel && reel !== '#' ? `<div class="mt-3"><a class="btn small secondary" href="${reel}" target="_blank" rel="noopener">Watch Reel</a></div>` : ''}
      `;
      const box = document.getElementById('wm-content');
      if (box) box.innerHTML = html;
      document.getElementById('wrestler-modal')?.showModal();
    });

    target.appendChild(el);
  });
}


function renderTryouts(list) {
  const target = document.querySelector('#tryout-list');
  if (!target) return;
  target.innerHTML = '';

  const items = Array.isArray(list) ? list : (list ? [list] : []);
  if (items.length === 0) {
    target.innerHTML = '<p class="muted">No open tryouts yet.</p>';
    return;
  }

  items.forEach(t => {
    const id   = t.tryoutId || t.id;
    const org  = t.orgName || t.org || '';
    const ownerId = t.ownerId || '';
    const city = t.city || '';
    const dateStr = t.date ? new Date(t.date).toLocaleDateString() : '';
    const reqs = t.requirements || '';
    const slots = t.slots ?? 0;
    const status = (t.status || 'open').toUpperCase();

    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.tryoutId = id;
    el.innerHTML = `<div class="badge">${status}</div>
      <h3 style="margin:6px 0 2px">
        ${ownerId ? `<a href="/p/#${encodeURIComponent(ownerId)}">${org}</a>` : org}
      </h3>
      <div class="muted">${city} • ${dateStr}</div>
      <p class="mt-3">${reqs}</p>
      <div class="mt-3">
        <button class="btn small apply-btn" data-id="${id}" data-org="${org}">Apply</button>
        <span class="muted" style="margin-left:10px">Slots: ${slots}</span>
      </div>`;
    target.appendChild(el);
  });

  getAuthState().then(s => {
    const allow = isWrestler(s); // from roles.js (state-based)
    document.querySelectorAll('.apply-btn').forEach(btn => {
      if (!allow) {
        btn.textContent = 'Log in as Wrestler to apply';
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          document.querySelector('#login-btn')?.click();
        }, { once: true });
      } else {
        btn.addEventListener('click', (e) => {
          const b = e.currentTarget;
          window.openApply(b.dataset.id, b.dataset.org);
        });
      }
    });
  });
}

function renderApps(list) {
  const target = document.querySelector('#app-list');
  if (!target) return;
  target.innerHTML = '';
  (list || []).forEach(a => {
    const reel = a.reelLink || a.reel || '#';
    const when = a.timestamp || a.created_at || a.createdAt || new Date().toISOString();
    const notes = a.notes || '';
    const who = a.applicantId ? `Applicant: ${a.applicantId}` : '';
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<div><strong>${who}</strong></div>
      <div class="mt-2"><a href="${reel}" target="_blank" rel="noopener">Reel</a> • <span class="muted">${new Date(when).toLocaleString()}</span></div>
      <div class="mt-2">${notes}</div>`;
    target.appendChild(el);
  });
}

function openApply(id, org) {
  const f = document.querySelector('#apply-form');
  if (!f) return;
  f.tryout_id.value = id;
  const title = document.querySelector('#apply-title');
  if (title) title.textContent = 'Apply to ' + org;
  const modal = document.querySelector('#apply-modal');
  if (modal) modal.showModal();
}
window.openApply = openApply;

async function renderTalentSearchPanel() {
  const searchForm = document.querySelector('#talent-search');
  const resultsWrap = document.querySelector('#talent-list')?.closest('section, .card, .panel') || document.querySelector('#talent-list');
  if (!searchForm) return;

  const s = await getAuthState();
  if (!isPromoter(s)) {
    // Clear and show locked state
    if (resultsWrap) {
      resultsWrap.innerHTML = `
        <div class="card">
          <h2>Talent Search <span class="badge">Locked</span></h2>
          <p class="muted">Only promoters can search wrestler profiles. 
          <a href="#" data-auth="out" id="become-promoter">Create a free promoter account</a>.</p>
        </div>`;
    } else {
      (searchForm.closest('section, .card, .panel') || searchForm).style.display = 'none';
    }
    return;
  }

  // Promoter allowed → wire live filtering
  const onFilter = async () => {
    try {
      const o = serializeForm(searchForm);
      const qs = new URLSearchParams();
      if (o.style && o.style !== 'any') qs.set('style', o.style);
      if (o.city) qs.set('city', o.city);
      if (o.verified === 'true') qs.set('verified', 'true');
      if (o.q) qs.set('q', o.q);

      const path = `/profiles/wrestlers${qs.toString() ? '?' + qs.toString() : ''}`;
      const list = await apiFetch(path);
      renderTalent(list);
    } catch (err) {
      console.error(err);
      toast('You must be a promoter to view talent profiles.', 'error');
      renderTalent([]);
    }
  };

  ['input','change'].forEach(evt => searchForm.addEventListener(evt, onFilter));
  onFilter();
}


async function renderTryoutsListPanel() {
  const listEl = document.querySelector('#tryout-list');
  if (!listEl) return;

  try {
    const list = await apiFetch('/tryouts'); // public on backend
    renderTryouts(list);
    if (location.hash) {
      const id = location.hash.substring(1);
      const el = document.querySelector(`[data-tryout-id="${id}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  } catch (err) {
    console.error(err);
    listEl.innerHTML = '<p class="muted">Could not load tryouts.</p>';
  }
}

async function renderAppsPanel() {
  const apps = document.querySelector('#app-list');
  if (!apps) return;

  try {
    const url = new URL(location.href);
    const tId = url.searchParams.get('tryout');
    const path = tId ? `/applications?tryoutId=${encodeURIComponent(tId)}` : '/applications';
    const list = await apiFetch(path);
    renderApps(list);
  } catch (err) {
    console.error(err);
    renderApps([]);
  }
}

async function wireForms() {
  const talentForm = document.querySelector('#talent-form');
  if (talentForm) {
    talentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const o = serializeForm(talentForm);
        const styles = (Array.isArray(o.styles) ? o.styles : [o.styles]).filter(Boolean);

        const body = {
          name: o.name, ring: o.ring, city: o.city,
          travel: Number(o.travel || 0),
          height_cm: Number(o.height_cm || 0),
          weight_kg: Number(o.weight_kg || 0),
          years: Number(o.years || 0),
          school: o.school || '',
          styles,
          reel: o.reel || '',
          rate_min: Number(o.rate_min || 0),
          rate_max: Number(o.rate_max || 0),
          verified_school: false
        };

        await apiFetch('/profiles/wrestlers', { method: 'POST', body });
        toast('Talent profile saved!');
        talentForm.reset();
      } catch (err) {
        console.error(err);
        toast('Could not save profile', 'error');
      }
    });
  }

  const tryoutForm = document.querySelector('#tryout-form');
  if (tryoutForm) {
    tryoutForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const o = serializeForm(tryoutForm);
        const body = {
          orgName: o.org || '',
          city: o.city || '',
          date: o.date || '',
          slots: Number(o.slots || 0),
          requirements: o.requirements || '',
          contact: o.contact || '',
          status: 'open'
        };
        await apiFetch('/tryouts', { method: 'POST', body });
        toast('Tryout posted!');
        tryoutForm.reset();
        await renderTryoutsListPanel();
      } catch (err) {
        console.error(err);
        toast('Could not post tryout', 'error');
      }
    });
  }

  const appForm = document.querySelector('#apply-form');
  if (appForm) {
    appForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const o = serializeForm(appForm);
        const body = {
          tryoutId: o.tryout_id,
          notes: o.notes || '',
          reelLink: o.reel || ''
        };
        await apiFetch('/applications', { method: 'POST', body });
        toast('Application sent!');
        appForm.reset();
        const modal = document.querySelector('#apply-modal'); if (modal) modal.close();
        await renderAppsPanel();
      } catch (err) {
        console.error(err);
        toast('Could not submit application', 'error');
      }
    });
  }

  await Promise.all([
    renderTalentSearchPanel(),
    renderTryoutsListPanel(),
    renderAppsPanel(),
  ]);
}

document.addEventListener('DOMContentLoaded', wireForms);
window.addEventListener('auth:changed', wireForms);
