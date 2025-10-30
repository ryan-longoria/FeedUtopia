// /js/promo_me.js
import { apiFetch, uploadToS3, md5Base64 } from "/js/api.js";
import { getAuthState, isPromoter } from "/js/roles.js";
import { mediaUrl } from "/js/media.js";

// ---------- tiny DOM helpers ----------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const setVal = (id, v = "") => {
  const el = document.getElementById(id);
  if (el) el.value = v ?? "";
};
const getVal = (id) => (document.getElementById(id)?.value ?? "").trim();
const setDisabled = (el, on, labelBusy = "Saving…") => {
  if (!el) return;
  el.disabled = !!on;
  if (on) {
    el.dataset.prevText = el.textContent;
    el.textContent = labelBusy;
  } else {
    el.textContent = el.dataset.prevText || el.textContent;
  }
};

function normalizeS3Key(uriOrKey, sub) {
  if (!uriOrKey) return null;
  let raw = String(uriOrKey).trim();

  // Strip "s3://bucket/" → leave just the key
  if (raw.startsWith("s3://")) {
    raw = raw.slice("s3://".length);
    const firstSlash = raw.indexOf("/");
    raw = firstSlash >= 0 ? raw.slice(firstSlash + 1) : raw; // remove "<bucket>/"
  }

  if (/^(public\/(wrestlers|promoters)\/|raw\/uploads\/)/.test(raw)) return raw;

  if (/^user\//.test(raw)) return raw;

  // Fallback: force "user/<sub>/<filename>"
  const fname = raw.split("/").pop() || `file-${Date.now()}`;
  return sub ? `user/${sub}/${fname}` : `user/unknown/${fname}`;
}

function toast(text, type = "success") {
  const t = document.querySelector("#toast");
  if (!t) return console[type === "error" ? "error" : "log"](text);
  t.textContent = text;
  t.classList.toggle("error", type === "error");
  t.style.display = "block";
  setTimeout(() => (t.style.display = "none"), 2400);
}

// ---------- media helpers (logos/photos/videos) ----------
const MEDIA_BASE = (window.WU_MEDIA_BASE || "").replace(/\/+$/, "");
const setLogoImg = (el, key) => {
  if (!el) return;
  if (!key) {
    el.src = "/assets/avatar-fallback.svg";
    return;
  }
  const url = mediaUrl(String(key));
  const needsBust =
    /^public\/promoters\/profiles\//.test(String(key)) ||
    /^profiles\//.test(String(key)); // legacy
  el.src = needsBust ? `${url}?v=${Date.now()}` : url;
};

// State for gallery (photos) + highlights (video links or absolute URLs)
let mediaKeys = []; // array of S3 object keys (images)
let highlights = []; // array of URLs (YouTube or absolute video URLs)

function wrap(tag, className, children) {
  const el = document.createElement(tag);
  if (className) el.className = className;

  if (children != null) {
    if (Array.isArray(children)) {
      children.forEach((c) => {
        if (c == null) return;
        el.appendChild(
          typeof c === "string" ? document.createTextNode(c) : c
        );
      });
    } else {
      el.appendChild(
        typeof children === "string" ? document.createTextNode(children) : children
      );
    }
  }

  return el;
}

function renderPhotoGrid() {
  const wrap = document.getElementById("photoGrid");
  if (!wrap) return;
  wrap.innerHTML = (mediaKeys || [])
    .map((k, i) => {
      const raw = typeof k === "string" && k.startsWith("raw/");
      const imgSrc = raw ? "/assets/image-processing.svg" : mediaUrl(k);
      return `
      <div class="media-card">
        <img src="${imgSrc}" alt="">
        <button class="btn secondary media-remove" type="button" data-i="${i}">Remove</button>
      </div>
    `;
    })
    .join("");
}

function renderHighlightList() {
  const ul = document.getElementById("highlightList");
  if (!ul) return;
  ul.innerHTML = (highlights || [])
    .map(
      (u, i) => `
    <li>
      <span style="flex:1; word-break:break-all">${u}</span>
      <button class="btn secondary" type="button" data-i="${i}">Remove</button>
    </li>
  `,
    )
    .join("");

  ul.querySelectorAll("button").forEach((btn) => {
    btn.onclick = () => {
      highlights.splice(Number(btn.dataset.i), 1);
      renderHighlightList();
    };
  });
}
  
async function uploadLogoIfAny() {
  const file = document.getElementById("logo")?.files?.[0];
  if (!file) return null;
  try {
    const md5b64 = await md5Base64(file);

    if (typeof apiFetch === "function") {
      // If you add a route like POST /profiles/promoters/me/logo-url (mirroring wrestlers)
      const presign = await apiFetch("/profiles/promoters/me/logo-url", {
        method: "POST",
        headers: { "Content-MD5": md5b64 },
        body: { contentType: file.type || "image/jpeg" },
      });
      if (presign?.uploadUrl && presign?.objectKey) {
        await fetch(presign.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": presign.contentType || file.type || "image/jpeg",
            "x-amz-server-side-encryption": "AES256",
            "Content-MD5": md5b64,
          },
          body: file,
        });
        return presign.objectKey; // e.g., public/promoters/profiles/<sub>/logo.png
      }
    }
  } catch (_) {
    /* fall through to generic */
  }

  // Fallback: generic presign (likely lands in raw/uploads or legacy user/<sub>/)
  return await uploadToS3(file.name, file.type || "image/jpeg", file);
}

// ---------- auth gate ----------
async function ensurePromoter() {
  const state = await getAuthState();
  if (!state || !isPromoter(state)) {
    toast("Please sign in as a promoter.", "error");
    return null;
  }
  document.body.classList.add("authenticated");
  return state;
}

// ---------- load existing profile ----------
async function loadMe() {
  try {
    const me = await apiFetch("/profiles/promoters/me", { method: "GET" });

    // Core fields
    setVal("orgName", me.orgName);
    setVal("address", me.address);
    setVal("city", me.city);
    setVal("region", me.region);
    setVal("country", me.country);
    setVal("website", me.website);
    setVal("contact", me.contact);
    setVal("bio", me.bio);

    // Socials (if your inputs exist)
    if (me.socials && typeof me.socials === "object") {
      for (const [k, v] of Object.entries(me.socials)) {
        setVal(`social_${k}`, v);
      }
    }

    // Logo preview
    const logoImg = document.getElementById("logoPreview");
    if (logoImg) setLogoImg(logoImg, me.logoKey);

    // Gallery + Highlights
    const { sub } = (await getAuthState()) || {};
    mediaKeys = Array.isArray(me.mediaKeys)
      ? me.mediaKeys.map((k) => normalizeS3Key(k, sub))
      : [];
    highlights = Array.isArray(me.highlights) ? [...me.highlights] : [];
    renderPhotoGrid();
    renderHighlightList();
  } catch (e) {
    // 404/empty is fine for first-time users
    console.debug("loadMe:", e.message || e);
  }
}

// ---------- init & events ----------
async function init() {
  const state = await ensurePromoter();
  if (!state) return;

  // Live logo preview
  const logoInput = document.getElementById("logo");
  const logoPreview = document.getElementById("logoPreview");
  logoInput?.addEventListener("change", () => {
    const f = logoInput.files?.[0];
    if (!f || !logoPreview) return;
    logoPreview.src = URL.createObjectURL(f);
  });

  // Add gallery photos (multi-upload)
  document
    .getElementById("addPhotosBtn")
    ?.addEventListener("click", async () => {
      const input = document.getElementById("photoFiles");
      const files = Array.from(input?.files || []);
      if (!files.length) return;

      try {
        const { sub } = (await getAuthState()) || {};
        for (const f of files) {
          const key = await uploadToS3(f.name, f.type || "image/jpeg", f, {
            actor: "promoter",
            type: "gallery",
          });
          mediaKeys.push(key);
        }
        renderPhotoGrid();
        input.value = "";
      } catch (err) {
        console.error(err);
        toast("Photo upload failed", "error");
      }
    });

  // Add highlight by URL
  document
    .getElementById("addHighlightUrlBtn")
    ?.addEventListener("click", () => {
      const el = document.getElementById("highlightUrl");
      const u = (el?.value || "").trim();
      if (!u) return;
      highlights.push(u);
      renderHighlightList();
      el.value = "";
    });

  // Upload highlight video file
  document
    .getElementById("uploadHighlightBtn")
    ?.addEventListener("click", async () => {
      const input = document.getElementById("highlightFile");
      const f = input?.files?.[0];
      if (!f) return;
      try {
        const { sub } = (await getAuthState()) || {};
        const key = await uploadToS3(f.name, f.type || "video/mp4", f, {
          actor: "promoter",
          type: "highlight",
        });
        const val =
          typeof key === "string" && key.startsWith("public/")
            ? mediaUrl(key)
            : key;
        highlights.push(val);
        renderHighlightList();
        input.value = "";
      } catch (err) {
        console.error(err);
        toast("Video upload failed", "error");
      }
    });

  // Save handler
  const form = document.getElementById("promoForm");
  const saveBtn = document.getElementById("saveBtn");

  form?.addEventListener("submit", async (evt) => {
    evt.preventDefault();
    setDisabled(saveBtn, true);

    try {
      // collect core fields
      const data = {
        orgName: getVal("orgName"),
        address: getVal("address"),
        city: getVal("city"),
        region: getVal("region"),
        country: getVal("country"),
        website: getVal("website"),
        contact: getVal("contact"),
        bio: getVal("bio"),
        mediaKeys,
        highlights,
      };

      // socials if present
      const socialKeys = [
        "twitter",
        "instagram",
        "facebook",
        "tiktok",
        "youtube",
        "website",
      ];
      const socials = {};
      for (const key of socialKeys) {
        const v = getVal(`social_${key}`);
        if (v) socials[key] = v;
      }
      if (Object.keys(socials).length) data.socials = socials;

      // upload logo if provided
      const logoKey = await uploadLogoIfAny();
      if (logoKey) data.logoKey = logoKey;

      // attach gallery + highlights
      data.mediaKeys = mediaKeys;
      data.highlights = highlights;

      // Save
      const saved = await apiFetch("/profiles/promoters", {
        method: "PUT",
        body: data,
      });

      toast("Promotion saved!");
      // refresh preview/preview button if you have one
      // (no-op by default)

      // Ensure preview reflects any new logo immediately
      if (saved?.logoKey && logoPreview) {
        setLogoImg(logoPreview, saved.logoKey);
      }
    } catch (err) {
      console.error(err);
      toast(err?.message || "Save failed", "error");
    } finally {
      setDisabled(saveBtn, false);
    }
  });

  await loadMe();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
