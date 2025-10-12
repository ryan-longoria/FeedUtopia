import { a as apiFetch } from "./core.js";
import { m as mediaUrl } from "./media.js";
import "https://esm.sh/aws-amplify@6";
import "https://esm.sh/aws-amplify@6/auth";
import "https://esm.sh/aws-amplify@6/utils";
const h = (str) => String(str ?? "").replace(
  /[&<>"]/g,
  (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[s]
);
const needsBust = (k) => /^public\/wrestlers\/profiles\//.test(String(k)) || /^profiles\//.test(String(k));
function imgSrcFromKey(key) {
  if (!key) return "/assets/avatar-fallback.svg";
  const s = String(key);
  if (s.startsWith("raw/")) return "/assets/image-processing.svg";
  return mediaUrl(s);
}
function fmtHeight(inches) {
  const n = Math.round(Number(inches));
  if (!Number.isFinite(n) || n <= 0) return null;
  const ft = Math.floor(n / 12);
  const inch = n % 12;
  return `${ft}'${inch}"`;
}
function fmtWeight(lb) {
  const n = Number(lb);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `${n} lb`;
}
function safeLink(url, label) {
  const u = String(url || "").trim();
  try {
    const parsed = new URL(u, location.origin);
    if (!/^https?:$/.test(parsed.protocol)) return "";
  } catch {
    return "";
  }
  return `<a href="${h(u)}" target="_blank" rel="noopener nofollow">${h(label || u)}</a>`;
}
async function run() {
  var _a;
  const wrap = document.getElementById("wp-wrap");
  const handle = (location.hash || "").replace(/^#/, "").trim();
  if (!wrap) return;
  if (!handle) {
    wrap.innerHTML = '<div class="card"><h2>Profile not found</h2></div>';
    return;
  }
  try {
    const p = await apiFetch(
      `/profiles/wrestlers/${encodeURIComponent(handle)}`
    );
    const stage = p.stageName || p.ring || p.name || handle;
    const name = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
    const loc = [p.city, p.region, p.country].filter(Boolean).join(" - ");
    const avatarBase = (p == null ? void 0 : p.photoKey) ? mediaUrl(p.photoKey) : "/assets/avatar-fallback.svg";
    const avatarSrc = (p == null ? void 0 : p.photoKey) && needsBust(p.photoKey) ? `${avatarBase}?v=${Date.now()}` : avatarBase;
    const chips = Array.isArray(p.gimmicks) ? p.gimmicks : [];
    const htStr = fmtHeight(p.heightIn);
    const wtStr = fmtWeight(p.weightLb);
    document.title = `${stage} – WrestleUtopia`;
    const socials = p.socials || {};
    const socialLinks = [
      socials.website && safeLink(socials.website, "Website"),
      socials.twitter && safeLink(socials.twitter, "Twitter"),
      socials.instagram && safeLink(socials.instagram, "Instagram"),
      socials.tiktok && safeLink(socials.tiktok, "TikTok"),
      socials.youtube && safeLink(socials.youtube, "YouTube")
    ].filter(Boolean).join(" • ");
    wrap.innerHTML = `
      <section class="hero card" style="max-width:980px;margin-inline:auto;overflow:hidden">
        ${p.coverKey ? `<img class="cover" src="${h(mediaUrl(p.coverKey))}" alt="">` : ""}
        <div class="hero-inner container">
          <img class="avatar-ring" src="${h(avatarSrc)}" alt="${h(stage)} avatar">
          <div class="hero-meta">
            <h1>${h(stage)}</h1>
            <div class="stats-bar">
              ${loc ? `<span class="pill">${h(loc)}</span>` : ""}
              ${htStr ? `<span class="pill">${htStr}</span>` : ""}
              ${wtStr ? `<span class="pill">${wtStr}</span>` : ""}
              ${Number.isFinite(+p.experienceYears) ? `<span class="pill">${p.experienceYears} yr experience</span>` : ""}
              ${Array.isArray(chips) && chips.length ? `<span class="pill">${h(chips.slice(0, 3).join(" • "))}</span>` : ""}
            </div>
            ${socialLinks ? `<div class="social-row mt-2">${socialLinks}</div>` : ""}
          </div>
        </div>
      </section>

      <section class="container" style="max-width:980px;margin-inline:auto">
        <nav class="tabs">
          <div class="tab-nav">
            <a href="#about" aria-current="page">About</a>
            <a href="#highlights">Highlights</a>
            <a href="#photos">Photos</a>
            ${p.achievements ? `<a href="#achievements">Achievements</a>` : ""}
          </div>
        </nav>

        <!-- Sections use IDs that match the hrefs so clicks scroll to them -->
        <div id="about" class="mt-3 card" style="scroll-margin-top: 90px;">
          <h2 class="mt-0">About</h2>
          ${p.bio ? `<p>${h(p.bio).replace(/\n/g, "<br/>")}</p>` : `<p class="muted">No bio yet.</p>`}
          <dl class="meta-list mt-2">
            ${name ? `<dt>Name</dt><dd>${h(name)}</dd>` : ""}
            ${p.emailPublic ? `<dt>Email</dt><dd>${h(p.emailPublic)}</dd>` : ""}
            ${p.phonePublic ? `<dt>Phone</dt><dd>${h(p.phonePublic)}</dd>` : ""}
            ${p.styles ? `<dt>Style</dt><dd>${h(p.styles)}</dd>` : ""}
            ${((_a = p.gimmicks) == null ? void 0 : _a.length) ? `<dt>Gimmicks</dt><dd>${p.gimmicks.map((c) => `<span class="chip">${h(c)}</span>`).join(" ")}</dd>` : ""}
          </dl>
        </div>

        <div id="highlights" class="mt-3" style="scroll-margin-top: 90px;">
          ${Array.isArray(p.highlights) && p.highlights.length ? `
            <div class="media-grid">
              ${p.highlights.map(
      (v) => `
                <div class="media-card">
                  ${/youtube|youtu\.be/i.test(String(v)) ? `<iframe width="100%" height="220" src="${h(String(v)).replace("watch?v=", "embed/")}" title="Highlight" frameborder="0" allowfullscreen></iframe>` : `<video src="${h(String(v))}" controls></video>`}
                </div>`
    ).join("")}
            </div>
          ` : `<div class="card"><p class="muted">No highlight videos yet.</p></div>`}
        </div>

        <div id="photos" class="mt-3" style="scroll-margin-top: 90px;">
          ${Array.isArray(p.mediaKeys) && p.mediaKeys.length ? `
            <div class="media-grid">
              ${p.mediaKeys.map((k) => `<div class="media-card"><img src="${h(imgSrcFromKey(k))}" alt=""></div>`).join("")}
            </div>
          ` : `<div class="card"><p class="muted">No photos yet.</p></div>`}
        </div>

        ${p.achievements ? `
          <div id="achievements" class="mt-3 card" style="scroll-margin-top: 90px;">
            <h2 class="mt-0">Achievements</h2>
            <p>${h(p.achievements).replace(/\n/g, "<br/>")}</p>
          </div>
        ` : ""}
      </section>
    `;
    const nav = wrap.querySelector(".tab-nav");
    const links = Array.from(nav.querySelectorAll("a"));
    const sections = links.map(
      (a) => document.getElementById(a.getAttribute("href").replace("#", ""))
    ).filter(Boolean);
    links.forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const id = a.getAttribute("href").replace("#", "");
        const target = document.getElementById(id);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          links.forEach(
            (l) => l.setAttribute("aria-current", l === a ? "page" : "false")
          );
          history.replaceState(null, "", `#${id}`);
        }
      });
    });
    const io = new IntersectionObserver(
      (entries) => {
        let topMost = null;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            if (!topMost || entry.boundingClientRect.top < topMost.boundingClientRect.top) {
              topMost = entry;
            }
          }
        }
        if (topMost) {
          const id = topMost.target.id;
          links.forEach(
            (l) => l.setAttribute(
              "aria-current",
              l.getAttribute("href") === `#${id}` ? "page" : "false"
            )
          );
        }
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: [0, 1] }
    );
    sections.forEach((sec) => io.observe(sec));
  } catch (e) {
    if (String(e).includes("API 401")) {
      wrap.innerHTML = `<div class="card"><h2>Sign in required</h2><p class="muted">Please sign in to view this profile.</p></div>`;
      return;
    }
    console.error(e);
    wrap.innerHTML = `<div class="card"><h2>Profile not found</h2><p class="muted">We couldn’t load ${h(handle)}.</p></div>`;
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run);
} else {
  run();
}
