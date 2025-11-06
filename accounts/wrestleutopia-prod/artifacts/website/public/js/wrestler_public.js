import { apiFetch } from "/js/api.js";
import { mediaUrl } from "/js/media.js";
import { enableMediaLightbox } from "/js/gallery.js";

const FETCH_TIMEOUT_MS = 8000;
const MAX_HIGHLIGHTS = 12;
const MAX_PHOTOS = 24;
const PROFILE_HANDLE_RE = /^[a-zA-Z0-9_-]{1,64}$/;

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

function asGimmicksText(p) {
  if (typeof p?.gimmicksText === "string" && p.gimmicksText.trim()) {
    return p.gimmicksText.trim();
  }
  if (Array.isArray(p?.gimmicks) && p.gimmicks.length) {
    return p.gimmicks.filter(Boolean).join(", ");
  }
  return "";
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

function normalizeHighlight(item) {
  if (!item) return null;

  if (typeof item === "string") {
    const s = item.trim();
    if (!s) return null;
    return s;
  }

  if (typeof item === "object") {
    if (typeof item.url === "string") return item.url;
    if (typeof item.href === "string") return item.href;
    if (typeof item.src === "string") return item.src;
    if (typeof item.key === "string") return item.key;
  }

  return null;
}

function renderHighlightCard(vRaw) {
  const v = normalizeHighlight(vRaw);
  if (!v) {
    return `<div class="media-card"><p class="muted">Invalid highlight</p></div>`;
  }

  const yt = toYoutubeEmbed(v);
  if (yt) {
    return `<div class="media-card"><iframe width="100%" height="220" src="${h(
      yt,
    )}" title="Highlight" frameborder="0" allowfullscreen></iframe></div>`;
  }

  if (/^(public|profiles|raw)\//.test(v)) {
    if (v.startsWith("raw/")) {
      return `<div class="media-card"><img src="/assets/image-processing.svg" alt="Processing video"></div>`;
    }
    const src = mediaUrl(v);
    return `
      <div class="media-card is-video">
        <video src="${h(src)}" preload="metadata" playsinline muted></video>
        <div class="play-badge" aria-hidden="true">▶</div>
      </div>
    `;
  }

  try {
    const parsed = new URL(v, location.origin);
    if (parsed.protocol === "https:" || parsed.origin === location.origin) {
      return `<div class="media-card"><video src="${h(
        parsed.href,
      )}" controls preload="metadata"></video></div>`;
    }
    return `
      <div class="media-card is-video">
        <video src="${h(parsed.href)}" preload="metadata" playsinline muted></video>
        <div class="play-badge" aria-hidden="true">▶</div>
      </div>
    `;
  } catch {
    return `<div class="media-card"><p class="muted">Invalid highlight</p></div>`;
  }
}

async function fetchWithTimeout(url, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error("fetch-timeout")), ms);
  try {
    return await apiFetch(url, { signal: ac.signal });
  } finally {
    clearTimeout(t);
  }
}

function getSlot(ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

function slotHasHeading(el) {
  if (!el) return false;
  return !!el.querySelector("h1, h2, h3, .section-title");
}

function fillExistingSlots(p, handle) {
  let touched = false;

  const avatarEl = document.getElementById("wp-avatar");
  const nameEl   = document.getElementById("wp-stage");

  const photoKey =
    p?.photoKey || p?.avatarKey || p?.avatar_key || p?.photo_key || null;

  const avatarBase = photoKey ? mediaUrl(photoKey) : "/assets/avatar-fallback.svg";
  const bustStamp =
    p.photoVersion ||
    p.updatedAt ||
    p.lastChangedAt ||
    (photoKey && needsBust(photoKey) ? Date.now() : "");

  const avatarSrc = photoKey && bustStamp
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

  const aboutEl = document.getElementById("wp-about");
  if (aboutEl) {
    const realName = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
    const loc = [p.city, p.region, p.country].filter(Boolean).join(" • ");
    const htStr = fmtHeight(p.heightIn);
    const wtStr = fmtWeight(p.weightLb);

    let html = "";
    html += `<dl class="meta-list mt-2">`;
    if (realName) html += `<dt>Name</dt><dd>${h(realName)}</dd>`;
    if (p.dob) html += `<dt>DOB</dt><dd>${h(p.dob)}</dd>`;
    if (loc) html += `<dt>Location</dt><dd>${h(loc)}</dd>`;
    if (htStr) html += `<dt>Height</dt><dd>${h(htStr)}</dd>`;
    if (wtStr) html += `<dt>Weight</dt><dd>${h(wtStr)}</dd>`;
    if (p.emailPublic) html += `<dt>Email</dt><dd>${h(p.emailPublic)}</dd>`;
    if (p.phonePublic) html += `<dt>Phone</dt><dd>${h(p.phonePublic)}</dd>`;
    if (p.styles) html += `<dt>Style</dt><dd>${h(p.styles)}</dd>`;
    {
      const gt = asGimmicksText(p);
      if (gt) {
        html += `<dt>Gimmick</dt><dd><p style="margin:0">${h(gt).replace(/\n/g, "<br/>")}</p></dd>`;
      }
    }
    html += `</dl>`;

    if (p.bio) {
      html += `<p class="mt-3">${h(p.bio).replace(/\n/g, "<br/>")}</p>`;
    } else {
      html += `<p class="mt-3 muted">No bio yet.</p>`;
    }

    aboutEl.innerHTML = html;
    touched = true;
  }

  const photosEl = getSlot(["wp-photos", "photosSection", "photos"]);
  if (photosEl) {
    const mediaKeys = Array.isArray(p.mediaKeys)
      ? p.mediaKeys.slice(0, MAX_PHOTOS)
      : [];
    const hasHeading = slotHasHeading(photosEl);

    if (mediaKeys.length) {
      photosEl.innerHTML = `
        ${hasHeading ? "" : "<h2>Photos</h2>"}
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
      photosEl.innerHTML = `
        ${hasHeading ? "" : "<h2>Photos</h2>"}
        <div class="card"><p class="muted">No photos yet.</p></div>
      `;
    }
    touched = true;
  }

  enableMediaLightbox(photosEl);

  const highlightsEl = getSlot([
    "wp-highlights",
    "videosSection",
    "highlights",
    "wp-videos",
  ]);
  if (highlightsEl) {
    const highlights = Array.isArray(p.highlights)
      ? p.highlights.map(normalizeHighlight).filter(Boolean).slice(0, MAX_HIGHLIGHTS)
      : [];
    const hasHeading = slotHasHeading(highlightsEl);

    if (highlights.length) {
      highlightsEl.innerHTML = `
        ${hasHeading ? "" : "<h2>Videos</h2>"}
        <div class="media-grid">
          ${highlights.map((v) => renderHighlightCard(v)).join("")}
        </div>
      `;
    } else {
      highlightsEl.innerHTML = `
        ${hasHeading ? "" : "<h2>Videos</h2>"}
        <div class="card"><p class="muted">No highlight videos yet.</p></div>
      `;
    }
    touched = true;
  }

  const achEl = getSlot(["wp-achievements", "achievements"]);
  if (achEl) {
    if (p.achievements) {
      achEl.innerHTML = `<h2 class="mt-0">Achievements</h2><p>${h(
        p.achievements,
      ).replace(/\n/g, "<br/>")}</p>`;
    } else {
      achEl.innerHTML = `<h2 class="mt-0">Achievements</h2><p class="muted">No achievements listed.</p>`;
    }
    touched = true;
  }

  return touched;
}

function renderFullPage(wrap, p, handle) {
  const stage = p.stageName || p.ring || p.name || handle;
  const name = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
  const loc = [p.city, p.region, p.country].filter(Boolean).join(", ");
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
    ? p.highlights.map(normalizeHighlight).filter(Boolean).slice(0, MAX_HIGHLIGHTS)
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

      <div id="about" class="mt-3 card" style="scroll-margin-top: 90px;">
        <h2 class="mt-0">About</h2>
        <dl class="meta-list mt-2">
          ${name ? `<dt>Name</dt><dd>${h(name)}</dd>` : ""}
          ${p.dob ? `<dt>DOB</dt><dd>${h(p.dob)}</dd>` : ""}
          ${loc ? `<dt>Location</dt><dd>${h(loc)}</dd>` : ""}
          ${htStr ? `<dt>Height</dt><dd>${h(htStr)}</dd>` : ""}
          ${wtStr ? `<dt>Weight</dt><dd>${h(wtStr)}</dd>` : ""}
          ${p.emailPublic ? `<dt>Email</dt><dd>${h(p.emailPublic)}</dd>` : ""}
          ${p.phonePublic ? `<dt>Phone</dt><dd>${h(p.phonePublic)}</dd>` : ""}
          ${p.styles ? `<dt>Style</dt><dd>${h(p.styles)}</dd>` : ""}
          ${(() => {
            const gt = asGimmicksText(p);
            return gt ? `<dt>Gimmick</dt><dd><p style="margin:0">${h(gt).replace(/\n/g, "<br/>")}</p></dd>` : "";
          })()}
        </dl>
        ${
          p.bio
            ? `<p class="mt-3">${h(p.bio).replace(/\n/g, "<br/>")}</p>`
            : `<p class="muted mt-3">No bio yet.</p>`
        }
      </div>

      <div id="photos" class="mt-3" style="scroll-margin-top: 90px;">
        <h2>Photos</h2>
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

      <div id="videos" class="mt-3" style="scroll-margin-top: 90px;">
        <h2>Videos</h2>
        ${
          highlights.length
            ? `
          <div class="media-grid">
            ${highlights.map((v) => renderHighlightCard(v)).join("")}
          </div>
        `
            : `<div class="card"><p class="muted">No highlight videos yet.</p></div>`
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

  const photosRoot = wrap.querySelector("#photos");
  if (photosRoot) enableMediaLightbox(photosRoot);

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

async function run() {
  const wrap = document.getElementById("wp-wrap");
  if (!wrap) return;

  const hadChildrenAtStart = wrap.children.length > 0;

  const hashHandle = (location.hash || "").replace(/^#/, "").trim();
  const dataHandle = wrap.dataset?.handle?.trim();
  const handle = hashHandle || dataHandle || "";

  if (!handle || !PROFILE_HANDLE_RE.test(handle)) {
    return;
  }

  try {
    const p = await fetchWithTimeout(
      `/profiles/wrestlers/${encodeURIComponent(handle)}`,
      FETCH_TIMEOUT_MS,
    );

    if (!p || typeof p !== "object") {
      return;
    }

    const filled = fillExistingSlots(p, handle);
    const wantsPublic = wrap.dataset?.public === "1";
    if (!filled && (!hadChildrenAtStart || wantsPublic)) {
      renderFullPage(wrap, p, handle);
    }
  } catch (e) {
    const msg = String(e || "");
    console.error("wrestler_public: fetch failed", { error: msg });

    if (hadChildrenAtStart) return;

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
