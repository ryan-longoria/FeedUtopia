// /js/public_profile.js
import { apiFetch } from "/js/api.js";
import { mediaUrl } from "/js/media.js";

const needsBust = (k) =>
  /^public\/wrestlers\/profiles\//.test(String(k)) ||
  /^profiles\//.test(String(k)); // legacy keys

function getHandleFromUrl() {
  const { pathname, search, hash } = location;
  const parts = pathname.replace(/\/+$/, "").split("/").filter(Boolean);

  // Prefer hash form first
  let handle = hash ? hash.slice(1) : "";

  // If no hash, allow /w/?handle=xyz
  if (!handle) {
    const q = new URLSearchParams(search);
    handle = q.get("handle") || "";
  }

  // If still no handle and URL is /w/<handle>, canonicalize to /w/#<handle>
  if (!handle && parts[0] === "w" && parts[1] && parts[1] !== "index.html") {
    const h = decodeURIComponent(parts[1]);
    // Rewrite once to the hash form (no history entry to avoid loops)
    location.replace(`/w/#${encodeURIComponent(h)}`);
    return ""; // stop current init; page will reload with hash
  }

  try {
    handle = decodeURIComponent(handle || "");
  } catch {}
  return handle;
}

function set(el, text) {
  const n = document.getElementById(el);
  if (n) n.textContent = text || "";
}
function html(el, markup) {
  const n = document.getElementById(el);
  if (n) n.innerHTML = markup || "";
}

function toast(text, type = "success") {
  const t = document.querySelector("#toast");
  if (!t) return console.log(text);
  t.textContent = text;
  t.classList.toggle("error", type === "error");
  t.style.display = "block";
  setTimeout(() => (t.style.display = "none"), 2400);
}

async function init() {
  // Only run on the public page to avoid stray errors
  if (!/\/w(\/|$)/.test(location.pathname)) return;

  const handle = getHandleFromUrl();
  if (!handle) {
    // If we just canonicalized, bail out; otherwise show message
    if (location.hash) return;
    html(
      "profile",
      `<div class="card"><h2>Profile not found</h2><p class="muted">Missing handle.</p></div>`
    );
    return;
  }

  try {
    const p = await apiFetch(`/profiles/wrestlers/${encodeURIComponent(handle)}`);

    document.title = `${p.stageName || "Wrestler"} – WrestleUtopia`;

    const img = document.getElementById("ph-avatar");
    if (img) {
      const base = p?.photoKey ? mediaUrl(p.photoKey) : "/assets/avatar-fallback.svg";
      img.src = p?.photoKey && needsBust(p.photoKey) ? `${base}?v=${Date.now()}` : base;
    }

    set("ph-stage", p.stageName || "Wrestler");
    const loc = [p.city, p.region, p.country].filter(Boolean).join(", ");
    set("ph-loc", loc);
    set("ph-name", p.name || "");
    set("ph-dob", p.dob || "");

    html(
      "ph-bio",
      p.bio ? `<p>${(p.bio || "").replace(/\n/g, "<br/>")}</p>` : '<p class="muted">No bio yet.</p>'
    );

    const gimmicks = Array.isArray(p.gimmicks) ? p.gimmicks : [];
    html("ph-gimmicks", gimmicks.map((g) => `<span class="chip">${g}</span>`).join("") || "");
  } catch (e) {
    if (String(e).includes("API 401")) {
      html(
        "profile",
        `<div class="card"><h2>Sign in required</h2><p class="muted">Please sign in to view this profile.</p></div>`
      );
      return;
    }
    console.error(e);
    html(
      "profile",
      `<div class="card"><h2>Profile not found</h2><p class="muted">We couldn’t find <code>${handle}</code>.</p></div>`
    );
    toast("Profile not found", "error");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
