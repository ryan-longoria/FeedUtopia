import { g as getAuthState, i as isPromoter, a as apiFetch, d as asItems } from "../assets/core-DtKmO-aM.js";
import "https://esm.sh/aws-amplify@6";
import "https://esm.sh/aws-amplify@6/auth";
import "https://esm.sh/aws-amplify@6/utils";
const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso || "";
  }
};
function cardForTryout(t) {
  const id = t.tryoutId || t.id || "";
  const org = t.orgName || t.org || "Promotion";
  const ownerId = t.ownerId || "";
  const city = t.city || "—";
  const date = fmtDate(t.date);
  const slots = typeof t.slots === "number" ? `<span class="muted" style="margin-left:10px">Slots: ${t.slots}</span>` : "";
  const status = (t.status || "open").toString().toUpperCase();
  const div = document.createElement("div");
  div.className = "card";
  div.innerHTML = `
    <div class="badge">${status}</div>
    <h3 style="margin:6px 0 2px">
      ${ownerId ? `<a href="/p/#${encodeURIComponent(ownerId)}">${org}</a>` : org}
    </h3>
    <div class="muted">${city} • ${date}</div>
    <p class="mt-3">${t.requirements || ""}</p>
    <div class="mt-3" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <a class="btn small" href="tryouts.html#${id}">View</a>
      <button class="btn small" type="button" data-view-applicants="${id}" data-org="${org}" data-city="${city}" data-date="${t.date || ""}">
        View Applicants
      </button>
      ${slots}
    </div>`;
  const btn = div.querySelector("[data-view-applicants]");
  btn == null ? void 0 : btn.addEventListener("click", (e) => {
    var _a;
    const b = e.currentTarget;
    (_a = window.openApplicantsModal) == null ? void 0 : _a.call(window, b.dataset.viewApplicants, {
      org: b.dataset.org,
      city: b.dataset.city,
      date: b.dataset.date
    });
  });
  return div;
}
function emptyState(target, title, msg) {
  target.innerHTML = `
    <div class="card">
      <h3>${title}</h3>
      <p class="muted">${msg}</p>
    </div>`;
}
async function loadMyOrgIntoForm() {
  const orgInput = document.getElementById("org");
  const hint = document.getElementById("org-hint");
  try {
    const me = await apiFetch("/profiles/promoters/me");
    const org = (me == null ? void 0 : me.orgName) || "";
    if (orgInput) {
      orgInput.value = org;
      orgInput.readOnly = true;
      orgInput.placeholder = org ? "" : "Create your promotion profile first";
    }
    if (hint) {
      hint.innerHTML = org ? "Pulled from your Promotion profile." : `No promotion profile yet. <a href="/promoter/">Create one</a> to post tryouts.`;
    }
    return org;
  } catch {
    if (hint)
      hint.innerHTML = `Couldn’t load your promotion. <a href="/promoter/">Create one</a>.`;
    return "";
  }
}
async function loadMyTryouts() {
  const activeEl = document.getElementById("my-active-tryouts");
  const prevEl = document.getElementById("my-previous-tryouts");
  if (!activeEl || !prevEl) return;
  activeEl.innerHTML = `<div class="card"><h3>Loading…</h3></div>`;
  prevEl.innerHTML = ``;
  const s = await getAuthState();
  if (!isPromoter(s)) {
    emptyState(activeEl, "Not authorized", "Promoter role required.");
    return;
  }
  try {
    const mine = await apiFetch("/tryouts/mine");
    const items = asItems(mine);
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const isOpen = (t) => (t.status || "open") === "open";
    const dateVal = (t) => {
      const d = new Date(t.date);
      return isNaN(d) ? null : d;
    };
    const active = items.filter((t) => {
      const d = dateVal(t);
      return isOpen(t) && d && d >= today;
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
    const previous = items.filter((t) => {
      const d = dateVal(t);
      return !isOpen(t) || !d || d < today;
    }).sort((a, b) => new Date(b.date) - new Date(a.date));
    if (active.length === 0) {
      emptyState(
        activeEl,
        "No active tryouts",
        "Post a new tryout to get started."
      );
    } else {
      activeEl.innerHTML = "";
      active.forEach((t) => activeEl.appendChild(cardForTryout(t)));
    }
    if (previous.length === 0) {
      emptyState(
        prevEl,
        "No previous tryouts",
        "Once your tryouts pass, they will appear here."
      );
    } else {
      prevEl.innerHTML = "";
      previous.forEach((t) => prevEl.appendChild(cardForTryout(t)));
    }
  } catch (e) {
    console.error("loadMyTryouts failed", e);
    emptyState(activeEl, "Error", "Could not load your tryouts.");
  }
}
function toastInline(text, type = "success") {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.cssText = `position:fixed;right:16px;bottom:16px;padding:10px 14px;border-radius:8px;
                      background:${type === "error" ? "#3b1f2a" : "#1f3b2a"};color:#fff;z-index:9999`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
async function wireTryoutForm() {
  const form = document.getElementById("tryout-form-dash");
  if (!form) return;
  let orgName = await loadMyOrgIntoForm();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const s = await getAuthState();
    if (!isPromoter(s)) {
      toastInline("Promoter role required", "error");
      return;
    }
    if (!orgName) {
      orgName = await loadMyOrgIntoForm();
      if (!orgName) {
        toastInline("Create your promotion profile first", "error");
        return;
      }
    }
    const data = new FormData(form);
    const body = {
      orgName,
      // <-- always from profile
      city: (data.get("city") || "").trim(),
      date: (data.get("date") || "").trim(),
      // YYYY-MM-DD
      slots: Number(data.get("slots") || 0),
      requirements: (data.get("requirements") || "").trim(),
      contact: (data.get("contact") || "").trim(),
      status: "open"
    };
    const btn = form.querySelector('button[type="submit"]');
    const prev = btn == null ? void 0 : btn.textContent;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Posting…";
    }
    try {
      await apiFetch("/tryouts", { method: "POST", body });
      toastInline("Tryout posted!");
      form.reset();
      document.getElementById("org").value = orgName;
      await loadMyTryouts();
    } catch (err) {
      console.error(err);
      toastInline("Could not post tryout", "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prev || "Post Tryout";
      }
    }
  });
}
async function initDash() {
  await loadMyTryouts();
  await wireTryoutForm();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDash, { once: true });
} else {
  initDash();
}
function h(s) {
  return String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]
  );
}
function dateNice(iso) {
  try {
    return iso ? new Date(iso).toLocaleString() : "";
  } catch {
    return iso || "";
  }
}
function mediaUrlFromKey(key) {
  if (!key) return "/assets/avatar-fallback.svg";
  if (String(key).startsWith("http")) return key;
  const base = (window.WU_MEDIA_BASE || "").replace(/\/+$/, "");
  return base ? `${base}/${key}` : "/assets/avatar-fallback.svg";
}
function renderApps(list) {
  const root = document.getElementById("app-list");
  if (!root) return;
  root.innerHTML = "";
  const items = Array.isArray(list) ? list : [];
  if (items.length === 0) {
    root.innerHTML = `<div class="card"><p class="muted">No applications yet.</p></div>`;
    return;
  }
  for (const a of items) {
    const p = a.applicantProfile || {};
    const handle = p.handle || "";
    const stage = p.stageName || "(No stage name)";
    const loc = [p.city, p.region].filter(Boolean).join(", ");
    const photo = mediaUrlFromKey(p.photoKey);
    const when = a.timestamp ? new Date(a.timestamp).toLocaleString() : "";
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `
      <div style="display:flex;gap:12px;align-items:center">
        <img src="${photo}" alt="" width="56" height="56" class="avatar br-full" loading="lazy"/>
        <div style="flex:1">
          <div class="text-lg">${stage}</div>
          <div class="muted">${loc || ""}</div>
          <div class="muted small mt-1">${when}</div>
          ${a.notes ? `<p class="mt-2">${String(a.notes).replace(/</g, "&lt;")}</p>` : ""}
          ${a.reelLink ? `<p class="mt-1"><a href="${a.reelLink}" target="_blank" rel="noopener">Watch Reel</a></p>` : ""}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${handle ? `<a class="btn small" href="/w/#${encodeURIComponent(handle)}">View Profile</a>` : ""}
        </div>
      </div>
    `;
    root.appendChild(el);
  }
}
function renderAppsIntoModal(list, meta = {}) {
  const box = document.getElementById("apps-modal-list");
  const sub = document.getElementById("apps-modal-subtitle");
  const dlg = document.getElementById("apps-modal");
  if (!box || !dlg) return;
  const labelBits = [
    meta.org && `<strong>${h(meta.org)}</strong>`,
    meta.city && h(meta.city),
    meta.date && new Date(meta.date).toLocaleDateString()
  ].filter(Boolean);
  if (sub)
    sub.innerHTML = labelBits.length ? labelBits.join(" • ") : "All applicants";
  const items = Array.isArray(list) ? list : [];
  if (!items.length) {
    box.innerHTML = `<div class="card"><p class="muted">No applications yet.</p></div>`;
    dlg.showModal();
    return;
  }
  box.innerHTML = items.map((a) => {
    const p = a.applicantProfile || {};
    const handle = p.handle || "";
    const stage = p.stageName || "(No stage name)";
    const loc = [p.city, p.region, p.country].filter(Boolean).join(", ");
    const when = dateNice(a.timestamp);
    const reel = a.reelLink ? `<a href="${h(a.reelLink)}" target="_blank" rel="noopener">Reel</a>` : "";
    const notes = a.notes ? `<div class="muted mt-1">${h(a.notes)}</div>` : "";
    return `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:start;flex-wrap:wrap">
          <div style="min-width:260px">
            <div class="text-lg">
              ${handle ? `<a href="/w/#${encodeURIComponent(handle)}">${h(stage)}</a>` : h(stage)}
            </div>
            <div class="muted small">${h(loc)}</div>
            <div class="muted small">${h(when)}</div>
            ${notes}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            ${reel}
            ${handle ? `<a class="btn small" href="/w/#${encodeURIComponent(handle)}">View Profile</a>` : ""}
          </div>
        </div>
      </div>`;
  }).join("");
  dlg.showModal();
}
async function openApplicantsModal(tryoutId, meta = {}) {
  try {
    const qs = tryoutId ? `?tryoutId=${encodeURIComponent(tryoutId)}` : "";
    const list = await apiFetch(`/applications${qs}`);
    renderAppsIntoModal(asItems(list), meta);
  } catch (e) {
    console.error(e);
    renderAppsIntoModal([], meta);
    if (typeof window.toast === "function") {
      window.toast("Could not load applications", "error");
    }
  }
}
window.openApplicantsModal = openApplicantsModal;
async function loadTryoutOptionsAndPick() {
  const sel = document.getElementById("apps-filter");
  if (!sel) return "";
  sel.querySelectorAll("option:not(:first-child)").forEach((o) => o.remove());
  try {
    const mine = await apiFetch("/tryouts/mine");
    const items = asItems(mine);
    for (const t of items) {
      const opt = document.createElement("option");
      opt.value = t.tryoutId || "";
      const date = t.date ? new Date(t.date).toLocaleDateString() : "";
      opt.textContent = `${t.orgName || "Tryout"} — ${t.city || ""}${date ? ` • ${date}` : ""}`;
      sel.appendChild(opt);
    }
    const first = sel.querySelector('option[value]:not([value=""])');
    if (first) {
      sel.value = first.value;
      return sel.value;
    }
  } catch (e) {
    console.debug("loadTryoutOptionsAndPick:", (e == null ? void 0 : e.message) || e);
  }
  return "";
}
async function loadApplications(tryoutId = "") {
  const qs = tryoutId ? `?tryoutId=${encodeURIComponent(tryoutId)}` : "";
  const list = await apiFetch(`/applications${qs}`);
  renderApps(asItems(list));
}
async function init() {
  const s = await getAuthState();
  if (!isPromoter(s)) return;
  const sel = document.getElementById("apps-filter");
  const chosen = await loadTryoutOptionsAndPick();
  if (chosen) await loadApplications(chosen);
  sel == null ? void 0 : sel.addEventListener("change", () => {
    const id = sel.value.trim();
    if (id) loadApplications(id);
    else {
      document.getElementById("app-list").innerHTML = `<div class="card"><p class="muted">Choose a tryout to see applicants.</p></div>`;
    }
  });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
const run$1 = async () => {
  try {
    const s = await getAuthState();
    if (!isPromoter(s)) {
      location.replace("index.html");
    }
  } catch (e) {
    console.error("promoter-guard failed", e);
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run$1, { once: true });
} else {
  run$1();
}
const run = () => {
  const dlg = document.getElementById("apps-modal");
  const closeBtn = document.getElementById("apps-modal-close");
  if (dlg && closeBtn) {
    closeBtn.addEventListener("click", () => dlg.close());
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run, { once: true });
} else {
  run();
}
