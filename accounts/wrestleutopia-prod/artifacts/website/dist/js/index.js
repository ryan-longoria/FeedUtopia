const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["js/chunks/core.js","styles/core.css"])))=>i.map(i=>d[i]);
import { _ as __vitePreload, a as apiFetch, g as getAuthState, i as isPromoter, b as isWrestler } from "./chunks/core.js";
import "./chunks/home-auth-cta.js";
import "https://esm.sh/aws-amplify@6";
import "https://esm.sh/aws-amplify@6/auth";
import "https://esm.sh/aws-amplify@6/utils";
async function userGroups() {
  var _a, _b;
  try {
    const { fetchAuthSession } = await __vitePreload(async () => {
      const { fetchAuthSession: fetchAuthSession2 } = await import("./chunks/core.js").then((n) => n.e);
      return { fetchAuthSession: fetchAuthSession2 };
    }, true ? __vite__mapDeps([0,1]) : void 0);
    const s = await fetchAuthSession();
    const id = (_b = (_a = s == null ? void 0 : s.tokens) == null ? void 0 : _a.idToken) == null ? void 0 : _b.toString();
    if (!id) return [];
    const payload = JSON.parse(atob(id.split(".")[1]));
    const g = payload["cognito:groups"];
    return Array.isArray(g) ? g : typeof g === "string" && g ? [g] : [];
  } catch {
    return [];
  }
}
function highlightNav() {
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((a) => {
    if (a.getAttribute("href") === path) a.classList.add("active");
  });
}
async function renderHomeTryouts(groups) {
  const tryoutList = document.querySelector("#home-tryouts");
  if (!tryoutList) return;
  const isWrestler2 = groups.includes("Wrestlers");
  if (!isWrestler2) return;
  try {
    let list = [];
    try {
      list = await apiFetch("/tryouts");
    } catch (e) {
      if (String(e).includes("API 401")) {
        tryoutList.innerHTML = '<p class="muted">Sign in to see current tryouts.</p>';
        return;
      }
      throw e;
    }
    const top = (list || []).slice(0, 6);
    tryoutList.innerHTML = "";
    if (top.length === 0) {
      tryoutList.innerHTML = '<p class="muted">No open tryouts yet.</p>';
      return;
    }
    top.forEach((t) => {
      const id = t.tryoutId || t.id || "";
      const org = t.orgName || t.org || "";
      const city = t.city || "";
      const date = t.date ? new Date(t.date).toLocaleDateString() : "";
      const reqs = t.requirements || "";
      const status = (t.status || "open").toUpperCase();
      const el = document.createElement("div");
      el.className = "card";
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
}
async function renderHomeTalentSpotlight(groups) {
  const spot = document.querySelector("#home-talent");
  if (!spot) return;
  const isPromoter2 = groups.includes("Promoters");
  if (!isPromoter2) {
    const section = spot.closest("section");
    if (section) section.style.display = "none";
    return;
  }
  try {
    const list = await apiFetch("/profiles/wrestlers");
    const top = (list || []).slice(0, 8);
    spot.innerHTML = "";
    if (top.length === 0) {
      spot.innerHTML = '<p class="muted">No talent to show yet.</p>';
      return;
    }
    top.forEach((p) => {
      const ring = p.ring || p.ringName || p.name || "Wrestler";
      const name = p.name || "";
      const yrs = p.years ?? p.yearsExperience ?? 0;
      const styles = Array.isArray(p.styles) ? p.styles : [];
      const avatar = p.avatar || `https://picsum.photos/seed/${encodeURIComponent(ring)}/200/200`;
      const city = p.city || "";
      const el = document.createElement("div");
      el.className = "card";
      el.innerHTML = `
        <div class="profile">
          <img src="${avatar}" alt="${ring} profile" />
          <div class="info">
            <div><strong>${ring}</strong> <span class="muted">(${name})</span></div>
            <div class="mt-2">${city} • ${yrs} yrs • ${styles.join(", ")}</div>
            <a class="btn small mt-3" href="talent.html#search">View profiles</a>
          </div>
        </div>
      `;
      spot.appendChild(el);
    });
  } catch (err) {
    console.log("Talent spotlight hidden:", (err == null ? void 0 : err.message) || err);
    const section = spot.closest("section");
    if (section) section.style.display = "none";
  }
}
async function renderHome() {
  highlightNav();
  const groups = await userGroups();
  await Promise.all([
    renderHomeTryouts(groups),
    renderHomeTalentSpotlight(groups)
  ]);
}
document.addEventListener("DOMContentLoaded", renderHome);
window.addEventListener("auth:changed", renderHome);
(async () => {
  try {
    const isHome = /^(\/|\/index\.html)$/.test(location.pathname);
    if (!isHome) return;
    const s = await getAuthState();
    if (!s) return;
    if (isPromoter(s)) {
      location.replace("/dashboard_promoter.html");
      return;
    }
    if (isWrestler(s)) {
      location.replace("/dashboard_wrestler.html");
      return;
    }
  } catch (e) {
    console.error("home-redirect failed", e);
  }
})();
const run$1 = async () => {
  try {
    const s = await getAuthState();
    if (isPromoter(s) || isWrestler(s)) {
      const el = document.getElementById("free-offer");
      if (el) el.remove();
    }
  } catch (e) {
    console.error("home-free-offer-hide failed", e);
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run$1, { once: true });
} else {
  run$1();
}
const renderLocked = () => `
  <div class="card locked-card wrestler-only">
    <div class="profile blurred">
      <img src="https://picsum.photos/seed/tryoutlock${Math.floor(Math.random() * 9999)}/200/200" alt="Locked tryout" width="200" height="200" loading="lazy"/>
      <div class="info">
        <div><strong>— — —</strong> <span class="muted">(— — —)</span></div>
        <div class="mt-2">— — • —/—/— • —, —</div>
        <p class="mt-2 muted">Full details and one-click apply are available to wrestlers.</p>
        <a class="btn small mt-3" href="#" data-auth="out">Create free wrestler account</a>
      </div>
    </div>
  </div>
`;
const run = async () => {
  try {
    const s = await getAuthState();
    if (isPromoter(s) || isWrestler(s)) return;
    const grid = document.querySelector("#home-tryouts");
    if (!grid) return;
    grid.innerHTML = renderLocked() + renderLocked() + renderLocked();
  } catch (e) {
    console.error("home-tryouts-locked failed", e);
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run, { once: true });
} else {
  run();
}
