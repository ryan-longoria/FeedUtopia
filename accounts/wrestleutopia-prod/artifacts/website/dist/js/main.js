const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["js/core.js","styles/core.css"])))=>i.map(i=>d[i]);
import { _ as __vitePreload, a as apiFetch } from "./core.js";
import "https://esm.sh/aws-amplify@6";
import "https://esm.sh/aws-amplify@6/auth";
import "https://esm.sh/aws-amplify@6/utils";
async function userGroups() {
  var _a, _b;
  try {
    const { fetchAuthSession } = await __vitePreload(async () => {
      const { fetchAuthSession: fetchAuthSession2 } = await import("./core.js").then((n) => n.e);
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
  const isWrestler = groups.includes("Wrestlers");
  if (!isWrestler) return;
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
  const isPromoter = groups.includes("Promoters");
  if (!isPromoter) {
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
