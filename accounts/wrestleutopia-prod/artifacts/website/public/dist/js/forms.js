import { apiFetch } from '/js/api.js';

// ------------------------
// Small utilities
// ------------------------
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

async function idToken() {
  const s = await fetchAuthSession();
  return s?.tokens?.idToken?.toString() || '';
}

// simple toast (global) to avoid dependency on fake_db.js
function toast(text, type = 'success') {
  const t = document.querySelector('#toast');
  if (!t) { if (type==='error') console.error(text); else console.log(text); return; }
  t.textContent = text;
  t.classList.toggle('error', type === 'error');
  t.style.display = 'block';
  setTimeout(() => (t.style.display = 'none'), 2600);
}
window.toast = toast; // keep legacy callers happy

// ------------------------
// Rendering helpers
// ------------------------
function renderTalent(list) {
  const target = document.querySelector('#talent-list');
  if (!target) return;
  target.innerHTML = '';
  (list || []).forEach(p => {
    const ring = p.ring || p.ringName || p.name || 'Wrestler';
    const name = p.name || '';
    const yrs  = p.years ?? p.yearsExperience ?? 0;
    const styles = Array.isArray(p.styles) ? p.styles : [];
    const avatar =
      p.avatar ||
      `https://picsum.photos/seed/${encodeURIComponent(ring)}/200/200`;
    const city = p.city || '';
    const rateMin = p.rate_min ?? p.rateMin ?? 0;
    const rateMax = p.rate_max ?? p.rateMax ?? 0;
    const verified = !!p.verified_school || !!p.verifiedSchool;
    const reel = p.reel || p.reelLink || '#';

    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<div class="profile">
      <img src="${avatar}" alt="${ring} profile"/>
      <div class="info">
        <div><strong>${ring}</strong> <span class="muted">(${name})</span></div>
        <div class="mt-2">${city} • ${yrs} yrs • ${styles.join(', ')}</div>
        <div class="mt-2">${verified ? '<span class="badge">Verified school</span>' : ''}</div>
        <div class="mt-2 muted">Rate: $${rateMin}-${rateMax}</div>
        <a class="btn small mt-3" href="${reel}" target="_blank" rel="noopener">View Reel</a>
      </div>
    </div>`;
    target.appendChild(el);
  });
}

function renderTryouts(list) {
  const target = document.querySelector('#tryout-list');
  if (!target) return;
  target.innerHTML = '';
  (list || []).forEach(t => {
    const id   = t.tryoutId || t.id;
    const org  = t.orgName || t.org || '';
    const city = t.city || '';
    const dateStr = t.date ? new Date(t.date).toLocaleDateString() : '';
    const reqs = t.requirements || '';
    const slots = t.slots ?? 0;
    const status = (t.status || 'open').toUpperCase();

    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.tryoutId = id;
    el.innerHTML = `<div class="badge">${status}</div>
      <h3 style="margin:6px 0 2px">${org}</h3>
      <div class="muted">${city} • ${dateStr}</div>
      <p class="mt-3">${reqs}</p>
      <div class="mt-3">
        <button class="btn small" onclick="openApply('${id}','${org}')">Apply</button>
        <span class="muted" style="margin-left:10px">Slots: ${slots}</span>
      </div>`;
    target.appendChild(el);
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
    const who = a.applicantId ? `Applicant: ${a.applicantId}` : ''; // minimal in MVP
    const el = document.createElement('div');
    el.className = 'card';
    el.innerHTML = `<div><strong>${who}</strong></div>
      <div class="mt-2"><a href="${reel}" target="_blank" rel="noopener">Reel</a> • <span class="muted">${new Date(when).toLocaleString()}</span></div>
      <div class="mt-2">${notes}</div>`;
    target.appendChild(el);
  });
}

// Keep onclick="openApply(...)" working from HTML
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

// ------------------------
// Wire up forms and lists
// ------------------------
document.addEventListener('DOMContentLoaded', () => {
  // ---- Talent submission (Wrestler profile: POST /profiles/wrestlers)
  const talentForm = document.querySelector('#talent-form');
  if (talentForm) {
    talentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const o = serializeForm(talentForm);
        const styles = (Array.isArray(o.styles) ? o.styles : [o.styles]).filter(Boolean);

        const body = {
          // server binds userId from token sub; we only send fields
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
        // If you want to immediately show their own profile somewhere, you could fetch it here.
      } catch (err) {
        console.error(err);
        toast('Could not save profile', 'error');
      }
    });
  }

  // ---- Tryout post (Promoter: POST /tryouts)
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
        // Reload list
        const list = await apiFetch('/tryouts');
        renderTryouts(list);
      } catch (err) {
        console.error(err);
        toast('Could not post tryout', 'error');
      }
    });
  }

  // ---- Applications: Wrestler apply (POST /applications)
  const appForm = document.querySelector('#apply-form');
  if (appForm) {
    appForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const o = serializeForm(appForm);
        const body = {
          tryoutId: o.tryout_id,                 // hidden field set by openApply()
          notes: o.notes || '',
          reelLink: o.reel || ''
        };
        await apiFetch('/applications', { method: 'POST', body });
        toast('Application sent!');
        appForm.reset();
        const modal = document.querySelector('#apply-modal'); if (modal) modal.close();
        // If you keep a “my applications” panel, you can refresh it here.
      } catch (err) {
        console.error(err);
        toast('Could not submit application', 'error');
      }
    });
  }

  // ---- Talent search (Promoter only: GET /profiles/wrestlers?...)
  const searchForm = document.querySelector('#talent-search');
  if (searchForm) {
    const onFilter = async () => {
      try {
        const o = serializeForm(searchForm);
        const qs = new URLSearchParams();
        if (o.style && o.style !== 'any') qs.set('style', o.style);
        if (o.city) qs.set('city', o.city);
        if (o.verified === 'true') qs.set('verified', 'true');
        // Optional text query (basic), server currently scans/filters
        if (o.q) qs.set('q', o.q);

        const path = `/profiles/wrestlers${qs.toString() ? '?' + qs.toString() : ''}`;
        const list = await apiFetch(path);
        renderTalent(list);
      } catch (err) {
        console.error(err);
        // If 403, user probably isn't in Promoters group.
        toast('You must be a promoter to view talent profiles.', 'error');
        renderTalent([]);
      }
    };
    ['input','change'].forEach(evt => searchForm.addEventListener(evt, onFilter));
    onFilter();
  }

  // ---- Tryouts listing (public to signed-in users): GET /tryouts
  if (document.querySelector('#tryout-list')) {
    (async () => {
      try {
        const list = await apiFetch('/tryouts');
        renderTryouts(list);

        // Deep link
        if (location.hash) {
          const id = location.hash.substring(1);
          const el = document.querySelector(`[data-tryout-id="${id}"]`);
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }
      } catch (err) {
        console.error(err);
        toast('Could not load tryouts', 'error');
      }
    })();
  }

  // ---- Applications list panel (two modes):
  // If URL has ?tryout=ID and caller owns that tryout -> promoter review
  // else show the caller’s own applications (wrestler)
  if (document.querySelector('#app-list')) {
    (async () => {
      try {
        const url = new URL(location.href);
        const tId = url.searchParams.get('tryout');
        const path = tId ? `/applications?tryoutId=${encodeURIComponent(tId)}` : '/applications';
        const list = await apiFetch(path);
        renderApps(list);
      } catch (err) {
        console.error(err);
        // Hide errors if the role doesn't match this panel's intent
        renderApps([]);
      }
    })();
  }
});
