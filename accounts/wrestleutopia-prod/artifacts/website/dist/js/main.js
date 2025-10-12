// public/js/main.js
import { apiFetch } from "/js/api.js";

/* ---------- auth helpers ---------- */
async function userGroups() {
  try {
    const { fetchAuthSession } = await import("/js/auth-bridge.js");
    const s = await fetchAuthSession();
    const id = s?.tokens?.idToken?.toString();
    if (!id) return [];
    const payload = JSON.parse(atob(id.split(".")[1]));
    const g = payload["cognito:groups"];
    return Array.isArray(g) ? g : typeof g === "string" && g ? [g] : [];
  } catch {
    return [];
  }
}

/* ---------- nav highlight (home only) ---------- */
function highlightNav() {
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((a) => {
    if (a.getAttribute("href") === path) a.classList.add("active");
  });
}

/* ---------- HOME: tryouts strip ---------- */
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
        tryoutList.innerHTML =
          '<p class="muted">Sign in to see current tryouts.</p>';
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

/* ---------- HOME: talent spotlight ---------- */
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
      const avatar =
        p.avatar ||
        `https://picsum.photos/seed/${encodeURIComponent(ring)}/200/200`;
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
    console.log("Talent spotlight hidden:", err?.message || err);
    const section = spot.closest("section");
    if (section) section.style.display = "none";
  }
}

/* ---------- TRYOUTS PAGE: full list ---------- */
async function renderTryoutsPage() {
  const grid = document.querySelector("#tryout-list");
  if (!grid) return; // not on this page

  try {
    let list = [];
    try {
      list = await apiFetch("/tryouts");
    } catch (e) {
      if (String(e).includes("API 401")) {
        grid.innerHTML =
          '<p class="muted">Sign in to see current tryouts.</p>';
        return;
      }
      throw e;
    }

    grid.innerHTML = "";
    if (!Array.isArray(list) || list.length === 0) {
      grid.innerHTML = '<p class="muted">No open tryouts yet.</p>';
      return;
    }

    list.forEach((t) => {
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
        <div class="mt-3">
          <button class="btn small" data-apply="${id}">Apply</button>
        </div>
      `;
      grid.appendChild(el);
    });

    // (Optional) wire up the Apply modal if your HTML includes it
    const modal = document.querySelector("#apply-modal");
    const form = document.querySelector("#apply-form");
    grid.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-apply]");
      if (!btn) return;
      const id = btn.getAttribute("data-apply");
      if (modal) {
        modal.querySelector('input[name="tryout_id"]').value = id;
        modal.showModal();
      }
    });

    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const tryoutId = fd.get("tryout_id");
        const payload = {
          ring: fd.get("ring") || "",
          name: fd.get("name") || "",
          reel: fd.get("reel") || "",
          notes: fd.get("notes") || "",
        };
        try {
          await apiFetch(`/tryouts/${encodeURIComponent(tryoutId)}/apply`, {
            method: "POST",
            body: payload,
          });
          alert("Application submitted!");
          modal?.close();
        } catch (err) {
          alert("Failed to submit application: " + (err?.message || err));
        }
      });
    }
  } catch (err) {
    console.error(err);
    grid.innerHTML = '<p class="muted">Could not load tryouts.</p>';
  }
}

/* ---------- Entrypoints ---------- */
async function renderHome() {
  highlightNav();
  const groups = await userGroups();
  await Promise.all([renderHomeTryouts(groups), renderHomeTalentSpotlight(groups)]);
}

document.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([renderHome(), renderTryoutsPage()]);
});

window.addEventListener("auth:changed", async () => {
  await Promise.all([renderHome(), renderTryoutsPage()]);
});

// debug hook you were using
window.__mainLoaded = true;
console.debug("[main] loaded");
