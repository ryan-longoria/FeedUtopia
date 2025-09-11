// /js/main.js
import { apiFetch } from '/js/api.js';

// Lightweight helper to read Cognito groups from the ID token
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

document.addEventListener('DOMContentLoaded', () => {
  // ---------- Nav highlighting ----------
  const path = location.pathname.split('/').pop();
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === path || (path === '' && a.getAttribute('href') === 'index.html')) {
      a.classList.add('active');
    }
  });

  // ---------- Home: Tryouts preview (Wrestlers only) ----------
  const tryoutList = document.querySelector('#home-tryouts');
  if (tryoutList) {
    (async () => {
      const groups = await userGroups();
      const isWrestler = groups.includes('Wrestlers');

      if (!isWrestler) {
        // Don’t call the API; show a friendly hint instead.
        tryoutList.innerHTML = '<p class="muted">Sign in as a Wrestler to view tryouts.</p>';
        return;
      }

      try {
        const list = await apiFetch('/tryouts'); // now JWT + role-gated
        const top = (list || []).slice(0, 6);
        if (top.length === 0) {
          tryoutList.innerHTML = '<p class="muted">No open tryouts yet.</p>';
          return;
        }
        tryoutList.innerHTML = '';
        top.forEach(t => {
          const id    = t.tryoutId || t.id || '';
          const org   = t.orgName || t.org || '';
          const city  = t.city || '';
          const date  = t.date ? new Date(t.date).toLocaleDateString() : '';
          const reqs  = t.requirements || '';
          const status = (t.status || 'open').toUpperCase();

          const el = document.createElement('div');
          el.className = 'card';
          el.innerHTML = `
            <div class="badge">${status}</div>
            <h3 style="margin:6px 0 2px">${org}</h3>
            <div class="muted">${city} • ${date}</div>
            <p class="mt-3">${reqs}</p>
            <a class="btn small mt-3" href="talent.html#search">View</a>
          `;
          el.dataset.tryoutId = id;
          tryoutList.appendChild(el);
        });
      } catch (err) {
        console.error(err);
        tryoutList.innerHTML = '<p class="muted">Could not load tryouts.</p>';
      }
    })();
  }

  // ---------- Home: Talent spotlight (Promoter-only; avoid 403) ----------
  const spot = document.querySelector('#home-talent');
  if (spot) {
    (async () => {
      const groups = await userGroups();
      const isPromoter = groups.includes('Promoters');

      if (!isPromoter) {
        const section = spot.closest('section');
        if (section) section.style.display = 'none';
        return;
      }

      try {
        const list = await apiFetch('/profiles/wrestlers');
        const top = (list || []).slice(0, 8);
        if (top.length === 0) {
          spot.innerHTML = '<p class="muted">No talent to show yet.</p>';
          return;
        }
        spot.innerHTML = '';
        top.forEach(p => {
          const ring = p.ring || p.ringName || p.name || 'Wrestler';
          const name = p.name || '';
          const yrs  = p.years ?? p.yearsExperience ?? 0;
          const styles = Array.isArray(p.styles) ? p.styles : [];
          const avatar = p.avatar || `https://picsum.photos/seed/${encodeURIComponent(ring)}/200/200`;
          const city = p.city || '';

          const el = document.createElement('div');
          el.className = 'card';
          el.innerHTML = `
            <div class="profile">
              <img src="${avatar}" alt="${ring} profile" />
              <div class="info">
                <div><strong>${ring}</strong> <span class="muted">(${name})</span></div>
                <div class="mt-2">${city} • ${yrs} yrs • ${styles.join(', ')}</div>
                <a class="btn small mt-3" href="talent.html#search">View profiles</a>
              </div>
            </div>
          `;
          spot.appendChild(el);
        });
      } catch (err) {
        console.log('Talent spotlight hidden:', err?.message || err);
        const section = spot.closest('section');
        if (section) section.style.display = 'none';
      }
    })();
  }
});
