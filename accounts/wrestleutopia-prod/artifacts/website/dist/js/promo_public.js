import { apiFetch } from "/js/api.js";
import { mediaUrl } from "/js/media.js";

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
  /^public\/promoters\/profiles\//.test(String(k)) ||
  /^profiles\//.test(String(k)); // legacy

function imgSrcFromKey(key) {
  if (!key) return "/assets/avatar-fallback.svg";
  const s = String(key);
  if (s.startsWith("raw/")) return "/assets/image-processing.svg";
  return mediaUrl(s);
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
    return `<div class="media-card"><video src="${h(
      src,
    )}" controls preload="metadata"></video></div>`;
  }

  try {
    const parsed = new URL(v, location.origin);
    if (parsed.protocol === "https:" || parsed.origin === location.origin) {
      return `<div class="media-card"><video src="${h(
        parsed.href,
      )}" controls preload="metadata"></video></div>`;
    }
    return `<div class="media-card"><p><a href="${h(
      parsed.href,
    )}" target="_blank" rel="noopener nofollow">View highlight</a></p></div>`;
  } catch {
    return `<div class="media-card"><p class="muted">Invalid highlight</p></div>`;
  }
}

function buildLocation(item = {}) {
  return [item.city, item.region, item.country].filter(Boolean).join(", ");
}

async function fetchWithTimeout(url, ms) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("fetch-timeout")), ms),
  );
  return Promise.race([apiFetch(url), timeout]);
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

function renderTryoutsList(list) {
  if (!Array.isArray(list) || !list.length)
    return `<div class="card"><p class="muted">No open tryouts.</p></div>`;

  const fmtDate = (d) => {
    try {
      const dt = new Date(d);
      if (isNaN(dt)) return "";
      return dt.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  };

  return `
    <div class="grid cols-2 mt-2">
      ${list
        .map((t) => {
          const date = t.date ? fmtDate(t.date) : "";
          const city = [t.city, t.region, t.country].filter(Boolean).join(", ");
          const title = h(t.orgName || "Tryout");
          const status = h((t.status || "open").toUpperCase());
          const tid = h(t.tryoutId || "");
          return `
            <div class="card">
              <div class="badge">${status}</div>
              <h3 style="margin:6px 0 2px">${title}</h3>
              <div class="muted">${h(city)}${date ? ` • ${h(date)}` : ""}</div>
              ${
                t.requirements
                  ? `<p class="mt-2">${h(String(t.requirements)).replace(/\n/g, "<br/>")}</p>`
                  : ""
              }
              ${tid ? `<a class="btn small mt-2" href="/tryouts.html#${tid}">View</a>` : ""}
            </div>`;
        })
        .join("")}
    </div>`;
}

function fillExistingSlots(p, tryouts) {
  let touched = false;

  const logoEl = document.getElementById("pp-logo");
  const nameEl = document.getElementById("pp-name");

  const orgName = p.orgName || p.name || "Promotion";

  const logoKey = p.logoKey || p.logo_key || null;
  const logoBase = logoKey ? mediaUrl(logoKey) : "/assets/avatar-fallback.svg";
  const bustStamp =
    p.logoVersion ||
    p.updatedAt ||
    p.lastChangedAt ||
    (logoKey && needsBust(logoKey) ? Date.now() : "");
  const logoSrc = logoKey && bustStamp
    ? `${logoBase}?v=${encodeURIComponent(bustStamp)}`
    : logoBase;

  if (logoEl) {
    logoEl.src = logoSrc;
    logoEl.alt = orgName;
    touched = true;
  }
  if (nameEl) {
    nameEl.textContent = orgName;
    touched = true;
  }

  const aboutEl = getSlot(["pp-about", "about"]);
  if (aboutEl) {
    const loc = buildLocation(p);
    const email = p.emailPublic;
    const phone = p.phonePublic;

    let html = `<dl class="meta-list mt-2">`;
    if (loc) html += `<dt>Location</dt><dd>${h(loc)}</dd>`;
    if (email) html += `<dt>Email</dt><dd>${h(email)}</dd>`;
    if (phone) html += `<dt>Phone</dt><dd>${h(phone)}</dd>`;
    html += `</dl>`;

    if (p.description || p.bio) {
      const desc = p.description || p.bio;
      html += `<p class="mt-3">${h(desc).replace(/\n/g, "<br/>")}</p>`;
    } else {
      html += `<p class="mt-3 muted">No description yet.</p>`;
    }

    aboutEl.innerHTML = html;
    touched = true;
  }

  const socialsEl = getSlot(["pp-socials", "socials"]);
  if (socialsEl) {
    const socials = p.socials || {};
    const links = [
      p.website && safeLink(p.website, "Website"),
      socials.website && safeLink(socials.website, "Website"),
      socials.twitter && safeLink(socials.twitter, "Twitter"),
      socials.instagram && safeLink(socials.instagram, "Instagram"),
      socials.tiktok && safeLink(socials.tiktok, "TikTok"),
      socials.youtube && safeLink(socials.youtube, "YouTube"),
      socials.facebook && safeLink(socials.facebook, "Facebook"),
    ]
      .filter(Boolean)
      .join(" • ");
    socialsEl.innerHTML = links || `<span class="muted">No social links.</span>`;
    touched = true;
  }

  const photosEl = getSlot(["pp-photos", "photosSection", "photos"]);
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

  const videosEl = getSlot(["pp-videos", "videosSection", "highlights"]);
  if (videosEl) {
    const highlights = Array.isArray(p.highlights)
      ? p.highlights.map(normalizeHighlight).filter(Boolean).slice(0, MAX_HIGHLIGHTS)
      : [];
    const hasHeading = slotHasHeading(videosEl);

    if (highlights.length) {
      videosEl.innerHTML = `
        ${hasHeading ? "" : "<h2>Videos</h2>"}
        <div class="media-grid">
          ${highlights.map((v) => renderHighlightCard(v)).join("")}
        </div>
      `;
    } else {
      videosEl.innerHTML = `
        ${hasHeading ? "" : "<h2>Videos</h2>"}
        <div class="card"><p class="muted">No highlight videos yet.</p></div>
      `;
    }
    touched = true;
  }

  const tryEl = getSlot(["pp-tryouts", "tryoutsSection", "tryouts"]);
  if (tryEl) {
    const hasHeading = slotHasHeading(tryEl);
    tryEl.innerHTML = `
      ${hasHeading ? "" : "<h2>Upcoming Tryouts</h2>"}
      ${renderTryoutsList(tryouts)}
    `;
    touched = true;
  }

  const rosterEl = getSlot(["pp-roster", "roster"]);
  if (rosterEl) {
    const roster = Array.isArray(p.rosterHandles) ? p.rosterHandles : [];
    const hasHeading = slotHasHeading(rosterEl);
    if (roster.length) {
      rosterEl.innerHTML = `
        ${hasHeading ? "" : "<h2>Roster</h2>"}
        <div class="media-grid mt-2">
          ${roster
            .slice(0, 48)
            .map(
              (hh) => `
              <a class="media-card" href="/w/#${encodeURIComponent(hh)}" aria-label="View roster profile ${h(
                hh,
              )}">
                <img src="/assets/avatar-fallback.svg" alt="">
              </a>`,
            )
            .join("")}
        </div>
      `;
    } else {
      rosterEl.innerHTML = `
        ${hasHeading ? "" : "<h2>Roster</h2>"}
        <div class="card"><p class="muted">No roster published.</p></div>
      `;
    }
    touched = true;
  }

  return touched;
}

function renderFullPage(wrap, p, tryouts) {
  const orgName = p.orgName || p.name || "Promotion";
  const locationLine = buildLocation(p);

  const logoBase = p.logoKey ? mediaUrl(p.logoKey) : "/assets/avatar-fallback.svg";
  const bustStamp =
    p.logoVersion ||
    p.updatedAt ||
    p.lastChangedAt ||
    (p.logoKey && needsBust(p.logoKey) ? Date.now() : "");
  const logoSrc =
    p.logoKey && bustStamp ? `${logoBase}?v=${encodeURIComponent(bustStamp)}` : logoBase;

  const cover = p.coverKey ? mediaUrl(p.coverKey) : "";

  const socials = p.socials || {};
  const socialLinks = [
    p.website && safeLink(p.website, "Website"),
    socials.website && safeLink(socials.website, "Website"),
    socials.twitter && safeLink(socials.twitter, "Twitter"),
    socials.instagram && safeLink(socials.instagram, "Instagram"),
    socials.tiktok && safeLink(socials.tiktok, "TikTok"),
    socials.youtube && safeLink(socials.youtube, "YouTube"),
    socials.facebook && safeLink(socials.facebook, "Facebook"),
  ]
    .filter(Boolean)
    .join(" • ");

  const highlights = Array.isArray(p.highlights)
    ? p.highlights.map(normalizeHighlight).filter(Boolean).slice(0, MAX_HIGHLIGHTS)
    : [];
  const mediaKeys = Array.isArray(p.mediaKeys) ? p.mediaKeys.slice(0, MAX_PHOTOS) : [];

  document.title = `${orgName} – WrestleUtopia`;

  wrap.innerHTML = `
    <section class="hero card" style="max-width:980px;margin-inline:auto;overflow:hidden">
      ${cover ? `<img class="cover" src="${h(cover)}" alt="">` : ""}
      <div class="hero-inner container">
        <img class="avatar-ring" src="${h(logoSrc)}" alt="${h(orgName)} logo">
        <div class="hero-meta">
          <h1>${h(orgName)}</h1>
          ${locationLine ? `<div class="handle">${h(locationLine)}</div>` : ""}
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
          <a href="#tryouts">Tryouts</a>
          ${Array.isArray(p.rosterHandles) && p.rosterHandles.length ? `<a href="#roster">Roster</a>` : ""}
        </div>
      </nav>

      <div id="about" class="mt-3 card" style="scroll-margin-top: 90px;">
        <h2 class="mt-0">About</h2>
        <dl class="meta-list mt-2">
          ${locationLine ? `<dt>Location</dt><dd>${h(locationLine)}</dd>` : ""}
          ${p.emailPublic ? `<dt>Email</dt><dd>${h(p.emailPublic)}</dd>` : ""}
          ${p.phonePublic ? `<dt>Phone</dt><dd>${h(p.phonePublic)}</dd>` : ""}
        </dl>
        ${
          p.description || p.bio
            ? `<p class="mt-3">${h(p.description || p.bio).replace(/\n/g, "<br/>")}</p>`
            : `<p class="muted mt-3">No description yet.</p>`
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
          </div>`
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
          </div>`
            : `<div class="card"><p class="muted">No highlight videos yet.</p></div>`
        }
      </div>

      <div id="tryouts" class="mt-3" style="scroll-margin-top: 90px;">
        <h2>Upcoming Tryouts</h2>
        ${renderTryoutsList(tryouts)}
      </div>

      ${
        Array.isArray(p.rosterHandles) && p.rosterHandles.length
          ? `
        <div id="roster" class="mt-3 card" style="scroll-margin-top: 90px;">
          <h2 class="mt-0">Roster</h2>
          <div class="media-grid mt-2">
            ${p.rosterHandles
              .slice(0, 48)
              .map(
                (hh) => `
              <a class="media-card" href="/w/#${encodeURIComponent(hh)}" aria-label="View roster profile ${h(
                hh,
              )}">
                <img src="/assets/avatar-fallback.svg" alt="">
              </a>`,
              )
              .join("")}
          </div>
        </div>`
          : ""
      }
    </section>
  `;

  const nav = wrap.querySelector(".tab-nav");
  if (nav && typeof nav.querySelectorAll === "function") {
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

function handleFromLocationOrData() {
  const u = new URL(location.href);
  const segs = u.pathname.split("/").filter(Boolean);
  const pathHandle = segs.length >= 2 && segs[0] === "p" ? segs[1] : "";
  const hashHandle = (u.hash || "").replace(/^#/, "").trim();
  const dataHandle = document.getElementById("pp-wrap")?.dataset?.handle?.trim();
  const handle = pathHandle || hashHandle || dataHandle || "";
  return handle;
}

async function run() {
  const wrap = document.getElementById("pp-wrap");
  if (!wrap) return;

  const hadChildrenAtStart = wrap.children.length > 0;
  const wantsPublic = wrap.dataset?.public === "1";

  const handle = handleFromLocationOrData();
  if (!handle || !PROFILE_HANDLE_RE.test(handle)) {
    if (!hadChildrenAtStart) {
      wrap.innerHTML = `<div class="card"><h2>Promotion not found</h2><p class="muted">Missing or invalid id.</p></div>`;
    }
    return;
  }

  try {
    const [p, tryouts] = await Promise.all([
      fetchWithTimeout(`/profiles/promoters/${encodeURIComponent(handle)}`, FETCH_TIMEOUT_MS),
      fetchWithTimeout(`/promoters/${encodeURIComponent(handle)}/tryouts`, FETCH_TIMEOUT_MS).catch(() => []),
    ]);

    if (!p || typeof p !== "object") {
      if (!hadChildrenAtStart) {
        wrap.innerHTML = `<div class="card"><h2>Promotion not found</h2><p class="muted">We couldn’t load ${h(
          handle,
        )}.</p></div>`;
      }
      return;
    }

    const filled = fillExistingSlots(p, Array.isArray(tryouts) ? tryouts : []);
    if (!filled && (!hadChildrenAtStart || wantsPublic)) {
      renderFullPage(wrap, p, Array.isArray(tryouts) ? tryouts : []);
    }
  } catch (e) {
    const msg = String(e || "");
    console.error("promo_public: fetch failed", { error: msg });

    if (hadChildrenAtStart) return;

    if (msg.includes("API 401")) {
      wrap.innerHTML = `<div class="card"><h2>Sign in required</h2><p class="muted">Please sign in to view this promotion.</p></div>`;
      return;
    }
    if (msg === "fetch-timeout") {
      wrap.innerHTML = `<div class="card"><h2>Slow response</h2><p class="muted">The profile service did not respond in time. Try again in a moment.</p></div>`;
      return;
    }
    wrap.innerHTML = `<div class="card"><h2>Promotion not found</h2><p class="muted">We couldn’t load ${h(
      handle,
    )}.</p></div>`;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run);
} else {
  run();
}
