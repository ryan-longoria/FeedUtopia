import { g as getAuthState, c as isWrestler, a as apiFetch, b as asItems } from "./core.js";
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
const daysUntil = (iso) => {
  const d = new Date(iso);
  const now = /* @__PURE__ */ new Date();
  if (isNaN(d)) return 9999;
  return Math.ceil((d - now) / (1e3 * 60 * 60 * 24));
};
async function getMyWrestlerProfile() {
  try {
    try {
      const me = await apiFetch("/profiles/wrestlers/me");
      if (me) return me;
    } catch {
    }
    try {
      const list = await apiFetch("/profiles/wrestlers?me=true");
      if (Array.isArray(list) && list.length) return list[0];
    } catch {
    }
  } catch {
  }
  return null;
}
function renderTryoutCard(t) {
  const id = t.tryoutId || t.id || "";
  const org = t.orgName || t.org || "Promotion";
  const ownerId = t.ownerId || "";
  const city = t.city || "—";
  const date = fmtDate(t.date);
  const reqs = t.requirements || "Basic bumps, cardio, promo.";
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
    <p class="mt-3">${reqs}</p>
    <div class="mt-3">
      <a class="btn small" href="tryouts.html#${id}" data-requires="wrestler">Apply</a>
      ${slots}
    </div>
  `;
  return div;
}
function renderEmptyTryouts(target) {
  target.innerHTML = `
    <div class="card">
      <h3>No recommended tryouts yet</h3>
      <p class="muted">We couldn’t find any upcoming open tryouts right now. Check back soon or browse all tryouts.</p>
      <div class="mt-3">
        <a class="btn small secondary" href="tryouts.html">Browse all tryouts</a>
      </div>
    </div>`;
}
function scoreTryout(t, profile) {
  const d = daysUntil(t.date);
  let score = Math.max(0, 60 - Math.min(60, d));
  if (profile) {
    const cityMatch = profile.city && t.city && profile.city.toLowerCase() === t.city.toLowerCase();
    if (cityMatch) score += 20;
    const styles = Array.isArray(profile.styles) ? profile.styles.map((s) => String(s).toLowerCase()) : [];
    if (styles.length) {
      const text = [t.requirements, t.title, t.orgName, t.org].filter(Boolean).join(" ").toLowerCase();
      const overlaps = styles.filter((s) => text.includes(s)).length;
      score += Math.min(20, overlaps * 7);
    }
  }
  return score;
}
async function loadRecommendedTryouts() {
  const target = document.getElementById("dash-tryouts");
  if (!target) return;
  target.innerHTML = `
    <div class="card">
      <h3>Loading recommended tryouts…</h3>
      <p class="muted">Fetching the latest openings for you.</p>
    </div>`;
  try {
    const s = await getAuthState();
    if (!isWrestler(s)) {
      renderEmptyTryouts(target);
      return;
    }
    let profile, list = [];
    try {
      [profile, list] = await Promise.all([
        getMyWrestlerProfile(),
        apiFetch("/tryouts")
      ]);
    } catch (e) {
      if (String(e).includes("API 401")) {
        target.innerHTML = '<div class="card"><p class="muted">Please sign in to view recommended tryouts.</p></div>';
        return;
      }
      throw e;
    }
    const now = /* @__PURE__ */ new Date();
    const upcomingOpen = asItems(list).filter((t) => {
      const d = new Date(t.date);
      return (t.status || "open") === "open" && !isNaN(d) && d >= now;
    });
    if (!upcomingOpen.length) {
      renderEmptyTryouts(target);
      return;
    }
    const ranked = upcomingOpen.map((t) => ({ t, score: scoreTryout(t, profile) })).sort((a, b) => b.score - a.score).slice(0, 6).map((x) => x.t);
    target.innerHTML = "";
    ranked.forEach((t) => target.appendChild(renderTryoutCard(t)));
  } catch (e) {
    console.error("dash recommended tryouts error", e);
    renderEmptyTryouts(target);
  }
}
function renderEmptyApps(target) {
  target.innerHTML = `
    <div class="card">
      <h3>No applications yet</h3>
      <p class="muted">When you apply to a tryout, it will show up here.</p>
    </div>`;
}
function renderAppCard(a) {
  const reel = a.reelLink || a.reel || "#";
  const when = a.timestamp || a.created_at || a.createdAt || (/* @__PURE__ */ new Date()).toISOString();
  const org = a.tryoutOrg || a.orgName || a.org || "Tryout";
  const status = (a.status || "submitted").toString().toUpperCase();
  const div = document.createElement("div");
  div.className = "card";
  div.innerHTML = `
    <div class="badge">${status}</div>
    <div class="mt-1"><strong>${org}</strong></div>
    <div class="mt-2"><a href="${reel}" target="_blank" rel="noopener">Reel</a> • <span class="muted">${new Date(when).toLocaleString()}</span></div>
    ${a.notes ? `<div class="mt-2">${a.notes}</div>` : ""}
  `;
  return div;
}
async function loadMyApplications() {
  const target = document.getElementById("dash-apps");
  if (!target) return;
  target.innerHTML = `
    <div class="card">
      <h3>Loading applications…</h3>
    </div>`;
  let s;
  try {
    s = await getAuthState();
  } catch {
  }
  const mySub = (s == null ? void 0 : s.sub) || null;
  async function trySeq(urls) {
    for (const u of urls) {
      try {
        return await apiFetch(u);
      } catch (e) {
        const msg = String(e);
        if (!(msg.includes("API 401") || msg.includes("API 403") || msg.includes("API 404")))
          throw e;
      }
    }
    return null;
  }
  try {
    const urls = [
      "/applications?me=true",
      mySub ? `/applications?applicantId=${encodeURIComponent(mySub)}` : null,
      mySub ? `/applications?userSub=${encodeURIComponent(mySub)}` : null,
      "/applications"
    ].filter(Boolean);
    let apps = asItems(await trySeq(urls));
    if (Array.isArray(apps) && mySub) {
      const keys = [
        "applicantId",
        "userSub",
        "user_id",
        "userId",
        "owner",
        "createdBy",
        "sub",
        "user_sub"
      ];
      apps = apps.filter(
        (a) => keys.some((k) => ((a == null ? void 0 : a[k]) || "").toString() === mySub)
      );
    }
    if (!Array.isArray(apps) || !apps.length) {
      renderEmptyApps(target);
      return;
    }
    target.innerHTML = "";
    apps.sort(
      (a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0)
    ).slice(0, 6).forEach((a) => target.appendChild(renderAppCard(a)));
  } catch (e) {
    console.error("dash apps error", e);
    renderEmptyApps(target);
  }
}
async function init() {
  await Promise.all([loadRecommendedTryouts(), loadMyApplications()]);
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
