// /js/wrestler_public.js
import { apiFetch } from "/js/api.js";
import { mediaUrl } from "/js/media.js";

// --- config ---
const FETCH_TIMEOUT_MS = 8000;
const MAX_HIGHLIGHTS = 12;
const MAX_PHOTOS = 24;
const PROFILE_HANDLE_RE = /^[a-zA-Z0-9_-]{1,64}$/;

// --- utils ---
const h = (str) =>
  String(str ?? "").replace(
    /[&<>"]/g,
    (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[s],
  );

const needsBust = (k) =>
  /^public\/wrestlers\/profiles\//.test(String(k)) ||
  /^profiles\//.test(String(k));

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

// only allow real youtube for iframe
function toYoutubeEmbed(url) {
  if (!url) return "";
  let u;
  try {
    u = new URL(String(url), "https://youtube.com");
  } catch {
    return "";
  }
  const host = u.hostname.toLowerCase();
  const isYT =
    host === "www.youtube.com" ||
    host === "youtube.com" ||
    host === "youtu.be" ||
    host.endsWith(".youtube.com");

  if (!isYT) return "";

  if (u.searchParams.has("v")) {
    const id = u.searchParams.get("v");
    return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
  }

  if (host === "youtu.be") {
    const id = u.pathname.replace(/^\/+/, "");
    if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
  }

  return "";
}

async function fetchWithTimeout(url, ms) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("fetch-timeout")), ms),
  );
  return Promise.race([apiFetch(url), timeout]);
}

// ------------------------------------------------------
// 1) Try to fill existing page (dashboard/editor style)
//    -> non-destructive
// ------------------------------------------------------
function fillExistingSlots(p, handle) {
  let touched = false;

  // avatar + name (if page has them)
  const avatarEl = document.getElementById("wp-avatar");
  const nameEl = document.getElementById("wp-stage");

  const avatarBase = p?.photoKey
    ? mediaUrl(p.photoKey)
    : "/assets/avatar-fallback.svg";
  const bustStamp =
    p.photoVersion ||
    p.updatedAt ||
    p.lastChangedAt ||
    (p.photoKey && needsBust(p.photoKey) ? Date.now() : "");
  const avatarSrc =
    p?.photoKey && bustStamp
      ? `${avatarBase}?v=${encodeURIComponent(bustStamp)}`
      : avatarBase;

  const stage = p.stageName || p.ring || p.name || handle;

  if (avatarEl) {
    avatarEl.src = avatarSrc;
    avatarEl.alt = stage;
    touched = true;
  }
  if (nameEl) {
    nameEl.textContent = stage;
    touched = true;
  }

  // about slot
  const aboutEl = document.getElementById("wp-about");
  if (aboutEl) {
    const realName = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
    let html = p.bio
      ? `<p>${h(p.bio).replace(/\n/g, "<br/>")}</p>`
      : `<p class="muted">No bio yet.</p>`;

    html += `<dl class="meta-list mt-2">`;
    if (realName) html += `<dt>Name</dt><dd>${h(realName)}</dd>`;
    if (p.emailPublic) html += `<dt>Email</dt><dd>${h(p.emailPublic)}</dd>`;
    if (p.phonePublic) html += `<dt>Phone</dt><dd>${h(p.phonePublic)}</dd>`;
    if (p.styles) html += `<dt>Style</dt><dd>${h(p.styles)}</dd>`;
    if (p.gimmicks?.length) {
      html += `<dt>Gimmicks</dt><dd>${p.gimmicks
        .map((c) => `<span class="chip">${h(c)}</span>`)
        .join(" ")}</dd>`;
    }
    html += `</dl>`;

    aboutEl.innerHTML = html;
    touched = true;
  }

  // highlights slot
  const highlightsEl = document.getElementById("wp-highlights");
  if (highlightsEl) {
    const highlights = Array.isArray(p.highlights)
      ? p.highlights.slice(0, MAX_HIGHLIGHTS)
      : [];
    if (highlights.length) {
      highlightsEl.innerHTML = `
        <div class="media-grid">
          ${highlights
            .map((vRaw) => {
              const v = String(vRaw || "");
              const yt = toYoutubeEmbed(v);
              if (yt) {
                return `<div class="media-card"><iframe width="100%" height="220" src="${h(
                  yt,
                )}" title="Highlight" frameborder="0" allowfullscreen></iframe></div>`;
              }
              try {
                const parsed = new URL(v, location.origin);
                if (parsed.origin === location.origin) {
                  return `<div class="media-card"><video src="${h(
                    parsed.href,
                  )}" controls></video></div>`;
                }
                return `<div class="media-card"><p><a href="${h(
                  parsed.href,
                )}" target="_blank" rel="noopener nofollow">View highlight</a></p></div>`;
              } catch {
                return `<div class="media-card"><p class="muted">Invalid highlight</p></div>`;
              }
            })
            .join("")}
        </div>
      `;
    } else {
      highlightsEl.innerHTML = `<div class="card"><p class="muted">No highlight videos yet.</p></div>`;
    }
    touched = true;
  }

  // photos slot
  const photosEl = document.getElementById("wp-photos");
  if (photosEl) {
    const mediaKeys = Array.isArray(p.mediaKeys)
      ? p.mediaKeys.slice(0, MAX_PHOTOS)
      : [];
    if (mediaKeys.length) {
      photosEl.innerHTML = `
        <div class="media-grid">
          ${mediaKeys
            .map(
              (k) =>
                `<div class="media-card"><img src="${h(
                  imgSrcFromKey(k),
                )}" alt=""></div>`,
            )
            .join("")}
        </div>
      `;
    } else {
      photosEl.innerHTML = `<div class="card"><p class="muted">No photos yet.</p></div>`;
    }
    touched = true;
  }

  // achievements slot
  const achEl = document.getElementById("wp-achievements");
  if (achEl) {
    if (p.achievements) {
      achEl.innerHTML = `<h2 class="mt-0">Achievements</h2><p>${h(
        p.achievements,
      ).replace(/\n/g, "<br/>")}</p>`;
    } else {
      achEl.innerHTML = `<p class="muted">No achievements listed.</p>`;
    }
    touched = true;
  }

  return touched;
}

// ------------------------------------------------------
// 2) Full render (only when container is empty or opted in)
// ------------------------------------------------------
function renderFullPage(wrap, p, handle) {
  const stage = p.stageName || p.ring || p.name || handle;
  const name = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
  const loc = [p.city, p.region, p.country].filter(Boolean).join(" - ");
  const chips = Array.isArray(p.gimmicks) ? p.gimmicks : [];
  const htStr = fmtHeight(p.heightIn);
  const wtStr = fmtWeight(p.weightLb);

  const avatarBase = p?.photoKey
    ? mediaUrl(p.photoKey)
    : "/assets/avatar-fallback.svg";
  const bustStamp =
    p.photoVersion ||
    p.updatedAt ||
    p.lastChangedAt ||
    (p.photoKey && needsBust(p.photoKey) ? Date.now() : "");
  const avatarSrc =
    p?.photoKey && bustStamp
      ? `${avatarBase}?v=${encodeURIComponent(bustStamp)}`
      : avatarBase;

  const socials = p.socials || {};
  const socialLinks = [
    socials.website && safeLink(socials.website, "Website"),
    socials.twitter && safeLink(socials.twitter, "Twitter"),
    socials.instagram && safeLink(socials.instagram, "Instagram"),
    socials.tiktok && safeLink(socials.tiktok, "TikTok"),
    socials.youtube && safeLink(socials.youtube, "YouTube"),
  ]
    .filter(Boolean)
    .join(" • ");

  const highlights = Array.isArray(p.highlights)
    ? p.highlights.slice(0, MAX_HIGHLIGHTS)
    : [];
  const mediaKeys = Array.isArray(p.mediaKeys)
    ? p.mediaKeys.slice(0, MAX_PHOTOS)
    : [];

  document.title = `${stage} – WrestleUtopia`;

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
            ${chips.length ? `<span class="pill">${h(chips.slice(0,3).join(" • "))}</span>` : ""}
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

      <div id="about" class="mt-3 card" style="scroll-margin-top: 90px;">
        <h2 class="mt-0">About</h2>
        ${p.bio ? `<p>${h(p.bio).replace(/\n/g, "<br/>")}</p>` : `<p class="muted">No bio yet.</p>`}
        <dl class="meta-list mt-2">
          ${name ? `<dt>Name</dt><dd>${h(name)}</dd>` : ""}
          ${p.emailPublic ? `<dt>Email</dt><dd>${h(p.emailPublic)}</dd>` : ""}
          ${p.phonePublic ? `<dt>Phone</dt><dd>${h(p.phonePublic)}</dd>` : ""}
          ${p.styles ? `<dt>Style</dt><dd>${h(p.styles)}</dd>` : ""}
          ${p.gimmicks?.length ? `<dt>Gimmicks</dt><dd>${p.gimmicks.map((c) => `<span class="chip">${h(c)}</span>`).join(" ")}</dd>` : ""}
        </dl>
      </div>

      <div id="highlights" class="mt-3" style="scroll-margin-top: 90px;">
        ${
          highlights.length
            ? `
          <div class="media-grid">
            ${highlights
              .map((vRaw) => {
                const v = String(vRaw || "");
                const yt = toYoutubeEmbed(v);
                if (yt) {
                  return `<div class="media-card"><iframe width="100%" height="220" src="${h(
                    yt,
                  )}" title="Highlight" frameborder="0" allowfullscreen></iframe></div>`;
                }
                try {
                  const parsed = new URL(v, location.origin);
                  if (parsed.origin === location.origin) {
                    return `<div class="media-card"><video src="${h(
                      parsed.href,
                    )}" controls></video></div>`;
                  }
                  return `<div class="media-card"><p><a href="${h(
                    parsed.href,
                  )}" target="_blank" rel="noopener nofollow">View highlight</a></p></div>`;
                } catch {
                  return `<div class="media-card"><p class="muted">Invalid highlight</p></div>`;
                }
              })
              .join("")}
          </div>
        `
            : `<div class="card"><p class="muted">No highlight videos yet.</p></div>`
        }
      </div>

      <div id="photos" class="mt-3" style="scroll-margin-top: 90px;">
        ${
          mediaKeys.length
            ? `
          <div class="media-grid">
            ${mediaKeys
              .map(
                (k) =>
                  `<div class="media-card"><img src="${h(
                    imgSrcFromKey(k),
                  )}" alt=""></div>`,
              )
              .join("")}
          </div>
        `
            : `<div class="card"><p class="muted">No photos yet.</p></div>`
        }
      </div>

      ${
        p.achievements
          ? `
        <div id="achievements" class="mt-3 card" style="scroll-margin-top: 90px;">
          <h2 class="mt-0">Achievements</h2>
          <p>${h(p.achievements).replace(/\n/g, "<br/>")}</p>
        </div>
      `
          : ""
      }
    </section>
  `;

  // nav wiring same as before
  const nav = wrap.querySelector(".tab-nav");
  if (nav) {
    const links = Array.from(nav.querySelectorAll("a"));
    const sections = links
      .map((a) => document.getElementById(a.getAttribute("href").replace("#", "")))
      .filter(Boolean);

    links.forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const id = a.getAttribute("href").replace("#", "");
        const target = document.getElementById(id);
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          links.forEach((l) =>
            l.setAttribute("aria-current", l === a ? "page" : "false"),
          );
          history.replaceState(null, "", `#${id}`);
        }
      });
    });

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          let topMost = null;
          for (const entry of entries) {
            if (entry.isIntersecting) {
              if (
                !topMost ||
                entry.boundingClientRect.top < topMost.boundingClientRect.top
              ) {
                topMost = entry;
              }
            }
          }
          if (topMost) {
            const id = topMost.target.id;
            links.forEach((l) =>
              l.setAttribute(
                "aria-current",
                l.getAttribute("href") === `#${id}` ? "page" : "false",
              ),
            );
          }
        },
        { rootMargin: "-40% 0px -55% 0px", threshold: [0, 1] },
      );

      sections.forEach((sec) => io.observe(sec));
    }
  }
}

// ------------------------------------------------------
// main
// ------------------------------------------------------
async function run() {
  const wrap = document.getElementById("wp-wrap");
  if (!wrap) return;

  // if page is already populated, we must not destroy it
  const hadChildrenAtStart = wrap.children.length > 0;

  // get handle from hash or data-handle
  const hashHandle = (location.hash || "").replace(/^#/, "").trim();
  const dataHandle = wrap.dataset?.handle?.trim();
  const handle = hashHandle || dataHandle || "";

  if (!handle || !PROFILE_HANDLE_RE.test(handle)) {
    // no valid handle -> just leave existing layout alone
    return;
  }

  try {
    const p = await fetchWithTimeout(
      `/profiles/wrestlers/${encodeURIComponent(handle)}`,
      FETCH_TIMEOUT_MS,
    );

    if (!p || typeof p !== "object") {
      // don't nuke current page
      return;
    }

    // 1) try to fill slots (non-destructive)
    const filled = fillExistingSlots(p, handle);

    // 2) if we didn't fill AND the container was empty OR explicitly public, render full
    const wantsPublic = wrap.dataset?.public === "1";
    if (!filled && (!hadChildrenAtStart || wantsPublic)) {
      renderFullPage(wrap, p, handle);
    }
  } catch (e) {
    const msg = String(e || "");
    console.error("wrestler_public: fetch failed", { handle, error: msg });

    // if page already had content, we don't overwrite it on error
    if (hadChildrenAtStart) {
      return;
    }

    if (msg.includes("API 401")) {
      wrap.innerHTML = `<div class="card"><h2>Sign in required</h2><p class="muted">Please sign in to view this profile.</p></div>`;
      return;
    }
    if (msg === "fetch-timeout") {
      wrap.innerHTML = `<div class="card"><h2>Slow response</h2><p class="muted">The profile service did not respond in time. Try again in a moment.</p></div>`;
      return;
    }
    wrap.innerHTML = `<div class="card"><h2>Profile not found</h2><p class="muted">We couldn’t load ${h(
      handle,
    )}.</p></div>`;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run);
} else {
  run();
}
