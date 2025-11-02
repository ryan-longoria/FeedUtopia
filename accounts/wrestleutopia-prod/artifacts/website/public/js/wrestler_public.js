// /js/wrestler_public.js
import { apiFetch } from "/js/api.js";
import { mediaUrl } from "/js/media.js";

// ------------------------------------------------------
// config
// ------------------------------------------------------
const FETCH_TIMEOUT_MS = 8000;
const MAX_HIGHLIGHTS = 12;
const MAX_PHOTOS = 24;
const PROFILE_HANDLE_RE = /^[a-zA-Z0-9_-]{1,64}$/;

// ------------------------------------------------------
// utils
// ------------------------------------------------------
const h = (str) =>
  String(str ?? "").replace(
    /[&<>"]/g,
    (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[s],
  );

const needsBust = (k) =>
  /^public\/wrestlers\/profiles\//.test(String(k)) ||
  /^profiles\//.test(String(k)); // legacy

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
  return `<a href="${h(u)}" target="_blank" rel="noopener nofollow">${h(
    label || u,
  )}</a>`;
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

  // /watch?v=XYZ
  if (u.searchParams.has("v")) {
    const id = u.searchParams.get("v");
    return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
  }

  // https://youtu.be/XYZ
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
// 1) Non-destructive fill of an existing page
//    (what your current ~500 line file does)
// ------------------------------------------------------
function fillExistingSlots(p, handle) {
  let touched = false;

  // ------------ hero / avatar / name ------------
  const avatarEl = document.getElementById("wp-avatar");
  const nameEl = document.getElementById("wp-stage");
  const coverEl = document.getElementById("wp-cover");

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
  if (coverEl && p.coverKey) {
    coverEl.src = mediaUrl(p.coverKey);
    coverEl.style.display = "";
    touched = true;
  }

  // ------------ about ------------
  // we support BOTH the old "single element" (#wp-about) style
  // AND the new, split style (#wp-about-meta + #wp-about)
  const aboutEl = document.getElementById("wp-about");
  const aboutMetaEl = document.getElementById("wp-about-meta");

  // common fields
  const realName = [p.firstName, p.middleName, p.lastName]
    .filter(Boolean)
    .join(" ");
  const loc = [p.city, p.region, p.country].filter(Boolean).join(", ");
  const htStr = fmtHeight(p.heightIn);
  const wtStr = fmtWeight(p.weightLb);

  const metaRows = [];

  if (realName) metaRows.push(`<dt>Name</dt><dd>${h(realName)}</dd>`);
  if (p.dob) metaRows.push(`<dt>DOB</dt><dd>${h(p.dob)}</dd>`);
  if (loc) metaRows.push(`<dt>Location</dt><dd>${h(loc)}</dd>`);
  if (htStr) metaRows.push(`<dt>Height</dt><dd>${h(htStr)}</dd>`);
  if (wtStr) metaRows.push(`<dt>Weight</dt><dd>${h(wtStr)}</dd>`);
  if (p.styles) metaRows.push(`<dt>Style</dt><dd>${h(p.styles)}</dd>`);
  if (Array.isArray(p.gimmicks) && p.gimmicks.length) {
    metaRows.push(
      `<dt>Gimmicks</dt><dd>${p.gimmicks
        .map((c) => `<span class="chip">${h(c)}</span>`)
        .join(" ")}</dd>`,
    );
  }
  if (p.emailPublic) metaRows.push(`<dt>Email</dt><dd>${h(p.emailPublic)}</dd>`);
  if (p.phonePublic) metaRows.push(`<dt>Phone</dt><dd>${h(p.phonePublic)}</dd>`);

  // new style: fill the <dl> and put bio last
  if (aboutMetaEl) {
    aboutMetaEl.innerHTML = metaRows.join("");
  }

  if (aboutEl) {
    if (aboutMetaEl) {
      // we have a separate meta <dl>, so this is just the bio
      if (p.bio) {
        aboutEl.innerHTML = h(p.bio).replace(/\n/g, "<br/>");
        aboutEl.classList.remove("muted");
      } else {
        aboutEl.textContent = "No bio yet.";
        aboutEl.classList.add("muted");
      }
    } else {
      // old style: a single container
      let html = p.bio
        ? `<p>${h(p.bio).replace(/\n/g, "<br/>")}</p>`
        : `<p class="muted">No bio yet.</p>`;
      if (metaRows.length) {
        html += `<dl class="meta-list mt-2">${metaRows.join("")}</dl>`;
      }
      aboutEl.innerHTML = html;
    }
    touched = true;
  }

  // ------------ stats bar (if the page has it) ------------
  const statsEl = document.getElementById("wp-stats");
  if (statsEl) {
    const pills = [];
    if (loc) pills.push(`<span class="pill">${h(loc)}</span>`);
    if (htStr) pills.push(`<span class="pill">${h(htStr)}</span>`);
    if (wtStr) pills.push(`<span class="pill">${h(wtStr)}</span>`);
    if (Number.isFinite(+p.experienceYears)) {
      pills.push(`<span class="pill">${p.experienceYears} yr experience</span>`);
    }
    if (Array.isArray(p.gimmicks) && p.gimmicks.length) {
      pills.push(
        `<span class="pill">${h(p.gimmicks.slice(0, 3).join(" • "))}</span>`,
      );
    }
    statsEl.innerHTML = pills.join("");
    touched = true;
  }

  // ------------ socials ------------
  const socialsEl = document.getElementById("wp-socials");
  if (socialsEl) {
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
    socialsEl.innerHTML = socialLinks;
    touched = true;
  }

  // ------------ highlights / videos ------------
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

              // NEW: restore old behavior -> render <video> even for https absolute
              if (/^https?:\/\//i.test(v)) {
                return `<div class="media-card"><video src="${h(
                  v,
                )}" controls></video></div>`;
              }

              // try to treat as same-origin link
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
      highlightsEl.innerHTML = `<p class="muted">No highlight videos yet.</p>`;
    }
    touched = true;
  }

  // ------------ photos ------------
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
      photosEl.innerHTML = `<p class="muted">No photos yet.</p>`;
    }
    touched = true;
  }

  // ------------ achievements ------------
  const achEl = document.getElementById("wp-achievements");
  const achTab = document.getElementById("tab-achievements");
  if (achEl) {
    if (p.achievements) {
      achEl.innerHTML = `<p>${h(p.achievements).replace(/\n/g, "<br/>")}</p>`;
      if (achEl.style) achEl.style.display = "";
      if (achTab) achTab.style.display = "";
    } else {
      achEl.innerHTML = `<p class="muted">No achievements listed.</p>`;
    }
    touched = true;
  }

  return touched;
}

// ------------------------------------------------------
// 2) Full render (for empty containers or explicit public)
//    *** THIS is where we change order to:
//    About -> Photos -> Videos -> Achievements
// ------------------------------------------------------
function renderFullPage(wrap, p, handle) {
  const stage = p.stageName || p.ring || p.name || handle;
  const name = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
  const loc = [p.city, p.region, p.country].filter(Boolean).join(", ");
  const htStr = fmtHeight(p.heightIn);
  const wtStr = fmtWeight(p.weightLb);
  const dob = p.dob ? String(p.dob) : null;

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

  // build <dl> for About (bio last)
  const aboutRows = [];
  if (name) aboutRows.push(`<dt>Name</dt><dd>${h(name)}</dd>`);
  if (dob) aboutRows.push(`<dt>DOB</dt><dd>${h(dob)}</dd>`);
  if (loc) aboutRows.push(`<dt>Location</dt><dd>${h(loc)}</dd>`);
  if (htStr) aboutRows.push(`<dt>Height</dt><dd>${h(htStr)}</dd>`);
  if (wtStr) aboutRows.push(`<dt>Weight</dt><dd>${h(wtStr)}</dd>`);
  if (p.styles) aboutRows.push(`<dt>Style</dt><dd>${h(p.styles)}</dd>`);
  if (Array.isArray(p.gimmicks) && p.gimmicks.length) {
    aboutRows.push(
      `<dt>Gimmicks</dt><dd>${p.gimmicks
        .map((c) => `<span class="chip">${h(c)}</span>`)
        .join(" ")}</dd>`,
    );
  }
  if (p.emailPublic)
    aboutRows.push(`<dt>Email</dt><dd>${h(p.emailPublic)}</dd>`);
  if (p.phonePublic)
    aboutRows.push(`<dt>Phone</dt><dd>${h(p.phonePublic)}</dd>`);

  // NOTE: order is About -> Photos -> Videos -> Achievements
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
            ${
              Array.isArray(p.gimmicks) && p.gimmicks.length
                ? `<span class="pill">${h(p.gimmicks.slice(0, 3).join(" • "))}</span>`
                : ""
            }
          </div>
          ${socialLinks ? `<div class="social-row mt-2">${socialLinks}</div>` : ""}
        </div>
      </div>
    </section>

    <section class="container" style="max-width:980px;margin-inline:auto">
      <nav class="tabs">
        <div class="tab-nav">
          <a href="#about" aria-current="page">About</a>
          <a href="#photos">Photos</a>
          <a href="#videos">Videos</a>
          ${p.achievements ? `<a href="#achievements">Achievements</a>` : ""}
        </div>
      </nav>

      <!-- ABOUT -->
      <div id="about" class="mt-3 card" style="scroll-margin-top: 90px;">
        <h2 class="mt-0">About</h2>
        ${
          aboutRows.length
            ? `<dl class="meta-list mt-2">${aboutRows.join("")}</dl>`
            : ""
        }
        ${
          p.bio
            ? `<p>${h(p.bio).replace(/\n/g, "<br/>")}</p>`
            : `<p class="muted">No bio yet.</p>`
        }
      </div>

      <!-- PHOTOS -->
      <div id="photos" class="mt-3" style="scroll-margin-top: 90px;">
        ${
          mediaKeys.length
            ? `
          <div class="card" style="padding:1.25rem;">
            <h2 class="mt-0">Photos</h2>
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
          </div>
        `
            : `
          <div class="card" style="padding:1.25rem;">
            <h2 class="mt-0">Photos</h2>
            <p class="muted">No photos yet.</p>
          </div>
        `
        }
      </div>

      <!-- VIDEOS -->
      <div id="videos" class="mt-3" style="scroll-margin-top: 90px;">
        ${
          highlights.length
            ? `
          <div class="card" style="padding:1.25rem;">
            <h2 class="mt-0">Videos</h2>
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

                  // restore old behavior -> render video even for absolute
                  if (/^https?:\/\//i.test(v)) {
                    return `<div class="media-card"><video src="${h(
                      v,
                    )}" controls></video></div>`;
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
          </div>
        `
            : `
          <div class="card" style="padding:1.25rem;">
            <h2 class="mt-0">Videos</h2>
            <p class="muted">No highlight videos yet.</p>
          </div>
        `
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

  // --- Smooth scrolling + active link state (same as before) ---
  const nav = wrap.querySelector(".tab-nav");
  if (nav) {
    const links = Array.from(nav.querySelectorAll("a"));
    const sections = links
      .map((a) =>
        document.getElementById(a.getAttribute("href").replace("#", "")),
      )
      .filter(Boolean);

    // Smooth scroll on click
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

    // Highlight active link while scrolling
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

  // track if page already had content (non-destructive mode)
  const hadChildrenAtStart = wrap.children.length > 0;

  // get handle from hash or from data-handle
  const hashHandle = (location.hash || "").replace(/^#/, "").trim();
  const dataHandle = wrap.dataset?.handle?.trim();
  const handle = hashHandle || dataHandle || "";

  if (!handle || !PROFILE_HANDLE_RE.test(handle)) {
    // no valid handle -> leave layout as-is
    return;
  }

  try {
    const p = await fetchWithTimeout(
      `/profiles/wrestlers/${encodeURIComponent(handle)}`,
      FETCH_TIMEOUT_MS,
    );

    if (!p || typeof p !== "object") {
      // if page already has stuff, don't nuke it
      if (!hadChildrenAtStart) {
        wrap.innerHTML = `<div class="card"><h2>Profile not found</h2><p class="muted">We couldn’t load ${h(
          handle,
        )}.</p></div>`;
      }
      return;
    }

    // 1) Try filling existing slots (non-destructive)
    const filled = fillExistingSlots(p, handle);

    // 2) If we didn't fill, and there was no initial content, or page opted in -> full render
    const wantsPublic = wrap.dataset?.public === "1";
    if (!filled && (!hadChildrenAtStart || wantsPublic)) {
      renderFullPage(wrap, p, handle);
    }
  } catch (e) {
    const msg = String(e || "");
    console.error("wrestler_public: fetch failed", { handle, error: msg });

    // if page already had content, don't wipe it
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
