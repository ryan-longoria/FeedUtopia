// /js/promo_me.js
import { apiFetch, uploadToS3, md5Base64 } from "/js/api.js";
import { getAuthState, isPromoter } from "/js/roles.js";
import { mediaUrl } from "/js/media.js";

(() => {
  // ---------- tiny DOM helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const setVal = (id, v = "") => {
    const el = document.getElementById(id);
    if (el) el.value = v ?? "";
  };

  // Cache-bust logos/covers on ~5 min boundaries (like profile_me)
  const AVATAR_BUST = Math.floor(Date.now() / (5 * 60 * 1000));

  // Limits/allow-lists aligned with profile_me.js
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
  const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25 MB
  const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/ogg"]);

  // State for gallery photos and highlight videos/links
  let mediaKeys = [];   // array of S3 object keys (images)
  let highlights = [];  // array of https URLs or keys

  // -------- media base guard (like profile_me) --------
  function safeMediaBase(raw) {
    if (typeof raw !== "string" || !raw) return "";
    try {
      const url = new URL(raw, location.origin);
      if (url.origin !== location.origin) return "";
      return url.toString().replace(/\/+$/, "");
    } catch {
      return "";
    }
  }
  const MEDIA_BASE = safeMediaBase(window.WU_MEDIA_BASE);

  function getHostFromUrl(u) {
    try {
      return new URL(u).host;
    } catch {
      return null;
    }
  }

  const ALLOWED_HIGHLIGHT_HOSTS = new Set([
    location.host,
    // YouTube
    "www.youtube.com", "youtube.com", "youtu.be",
    // Vimeo
    "vimeo.com", "www.vimeo.com",
    // TikTok
    "www.tiktok.com", "tiktok.com", "vm.tiktok.com",
    // Instagram
    "www.instagram.com", "instagram.com",
    // Threads
    "www.threads.net", "threads.net",
    // X / Twitter
    "x.com", "www.x.com", "twitter.com", "www.twitter.com",
    // Facebook
    "www.facebook.com", "facebook.com",
    // LinkedIn
    "www.linkedin.com", "linkedin.com",
  ]);
  if (MEDIA_BASE) {
    const h = getHostFromUrl(MEDIA_BASE);
    if (h) ALLOWED_HIGHLIGHT_HOSTS.add(h);
  }

  function isKeyLike(val) {
    return (
      typeof val === "string" &&
      (val.startsWith("public/") || val.startsWith("profiles/") || val.startsWith("raw/") || val.startsWith("user/"))
    );
  }

  // ---------- image helpers ----------
  function setLogoImg(sel, key) {
    const el = typeof sel === "string" ? $(sel) : sel;
    if (!el) return;
    if (!key) {
      el.src = "/assets/avatar-fallback.svg";
      return;
    }
    const url = mediaUrl(String(key));
    const needsBust =
      /^public\/promoters\/profiles\//.test(String(key)) || /^profiles\//.test(String(key));
    el.src = needsBust ? `${url}?v=${AVATAR_BUST}` : url;
  }

  function photoUrlFromKey(key) {
    return key ? mediaUrl(String(key)) : "/assets/avatar-fallback.svg";
  }

  // ---------- UX helpers ----------
  function toast(text, type = "success") {
    const t = $("#toast");
    if (!t) {
      console.log(`[toast:${type}]`, text);
      return;
    }
    t.textContent = text;
    t.classList.toggle("error", type === "error");
    t.style.display = "block";
    setTimeout(() => (t.style.display = "none"), 2400);
  }

  function setDisabled(el, on, labelBusy) {
    if (!el) return;
    el.disabled = !!on;
    if (labelBusy) {
      const prev = el.dataset.prevText || el.textContent;
      if (on) {
        el.dataset.prevText = prev;
        el.textContent = labelBusy;
      } else {
        el.textContent = el.dataset.prevText || el.textContent;
      }
    }
  }

  // ---------- role/auth ----------
  async function ensurePromoter() {
    const s = await getAuthState();
    if (!isPromoter(s)) {
      toast("Promoter role required", "error");
      // mirror profile_me behavior when not authorized
      location.replace("/login.html?next=/promo_me.html");
      return null;
    }
    return s;
  }

  // ---------- validation ----------
  function assertFileAllowed(file, kind = "image") {
    if (!file) return "No file selected";
    const typeSet = kind === "video" ? VIDEO_TYPES : IMAGE_TYPES;
    const max = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (!typeSet.has(file.type)) return "Unsupported file type";
    if (file.size > max) return "File too large";
    return null;
  }

  // Normalize/validate external highlight URLs (https + allowlist)
  function safeHighlightUrl(raw) {
    try {
      const url = new URL(raw, location.origin);
      if (url.protocol !== "https:") return null;

      // Allow same-origin absolute media links
      if (url.origin === location.origin) return url.toString();

      // Otherwise enforce host allowlist
      if (!ALLOWED_HIGHLIGHT_HOSTS.has(url.host)) return null;

      // Normalize youtu.be -> youtube watch form (public renderer can embed)
      if (url.host === "youtu.be") {
        const id = url.pathname.slice(1);
        if (!id) return null;
        return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
      }

      return url.toString();
    } catch {
      return null;
    }
  }

  // ---------- DOM renderers (safe, no innerHTML with user HTML) ----------
  function renderPhotoGrid() {
    const wrap = document.getElementById("photoGrid");
    if (!wrap) return;
    wrap.textContent = ""; // clear safely

    (mediaKeys || []).forEach((k, i) => {
      const card = document.createElement("div");
      card.className = "media-card";
      card.dataset.i = String(i);

      const img = document.createElement("img");
      img.alt = `Promotion media ${i}`;
      if (typeof k === "string" && k.startsWith("raw/")) {
        img.src = "/assets/image-processing.svg";
      } else {
        try {
          img.src = mediaUrl(String(k));
        } catch {
          img.src = "/assets/image-broken.svg";
        }
      }

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn secondary media-remove";
      btn.textContent = "Remove";
      btn.addEventListener("click", () => {
        mediaKeys = mediaKeys.filter((_, idx) => idx !== i);
        renderPhotoGrid();
      });

      card.appendChild(img);
      card.appendChild(btn);
      wrap.appendChild(card);
    });
  }

  function renderHighlightList() {
    const ul = document.getElementById("highlightList");
    if (!ul) return;
    ul.textContent = "";

    (highlights || []).forEach((item, i) => {
      let display;
      if (typeof item === "string" && /^https?:\/\//i.test(item)) {
        display = item;
      } else if (isKeyLike(item)) {
        display = mediaUrl(item);
      } else {
        display = String(item);
      }

      const li = document.createElement("li");
      li.dataset.i = String(i);

      const span = document.createElement("span");
      span.style.flex = "1";
      span.style.wordBreak = "break-all";
      span.textContent = display;

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn secondary";
      btn.textContent = "Remove";
      btn.addEventListener("click", () => {
        highlights = highlights.filter((_, idx) => idx !== i);
        renderHighlightList();
      });

      li.appendChild(span);
      li.appendChild(btn);
      ul.appendChild(li);
    });
  }

  // ---------- uploads (presign preferred, fallback to uploadToS3) ----------
  async function putViaPresign(presign, file, md5b64) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 25_000);
    try {
      const res = await fetch(presign.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": presign.contentType || file.type || "application/octet-stream",
          "x-amz-server-side-encryption": "AES256",
          "Content-MD5": md5b64,
        },
        body: file,
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    } finally {
      clearTimeout(t);
    }
  }

  async function uploadGeneric(file, meta = {}) {
    const kind = meta.kind || "image";
    const err = assertFileAllowed(file, kind);
    if (err) throw new Error(err);

    // Try role-aware presign first
    const md5b64 = await md5Base64(file).catch(() => null);
    const presign = await apiFetch("/media/presign", {
      method: "POST",
      body: {
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        md5: md5b64 || undefined,
        ...meta, // e.g., { actor: "promoter", type: "gallery", kind: "image" }
      },
    }).catch(() => null);

    if (presign?.uploadUrl && presign?.objectKey) {
      await putViaPresign(presign, file, md5b64 || "");
      return presign.objectKey;
    }

    // Legacy fallback
    return uploadToS3(file.name, file.type || "application/octet-stream", file, meta);
  }

  let currentLogoObjectUrl = null;
  async function uploadLogoIfAny() {
    const input = document.getElementById("logo");
    const file = input?.files?.[0];
    if (!file) return null;

    const err = assertFileAllowed(file, "image");
    if (err) {
      toast(err, "error");
      return null;
    }
    return uploadGeneric(file, { actor: "promoter", type: "logo", kind: "image" });
  }

  // ---------- load profile ----------
  async function loadMe() {
    try {
      const me = await apiFetch("/profiles/promoters/me");
      if (!me || !me.userId) return;

      // Base fields
      setVal("orgName", me.orgName);
      setVal("address", me.address);
      setVal("city", me.city);
      setVal("region", me.region);
      setVal("country", me.country);
      setVal("website", me.website);
      setVal("contact", me.contact);
      setVal("bio", me.bio);

      // Socials
      if (me.socials && typeof me.socials === "object") {
        const s = me.socials;
        if (s.twitter) setVal("social_twitter", s.twitter);
        if (s.instagram) setVal("social_instagram", s.instagram);
        if (s.tiktok) setVal("social_tiktok", s.tiktok);
        if (s.youtube) setVal("social_youtube", s.youtube);
        if (s.facebook) setVal("social_facebook", s.facebook);
        if (s.website) setVal("social_website", s.website);
      }

      // Media
      mediaKeys = Array.isArray(me.mediaKeys) ? [...me.mediaKeys] : [];

      // Highlights: normalize to https URLs or keys
      highlights = Array.isArray(me.highlights)
        ? me.highlights
            .map((item) => {
              if (typeof item === "string") {
                const s = item.trim();
                if (!s) return null;
                try {
                  const u = new URL(s);
                  if (u.protocol === "https:") return safeHighlightUrl(u.toString());
                } catch {
                  if (isKeyLike(s)) return s;
                  return null;
                }
              }
              if (item && typeof item === "object") {
                if (typeof item.url === "string") return safeHighlightUrl(item.url) || null;
                if (typeof item.href === "string") return safeHighlightUrl(item.href) || null;
                if (typeof item.src === "string") return safeHighlightUrl(item.src) || null;
                if (typeof item.key === "string") return item.key;
              }
              return null;
            })
            .filter(Boolean)
        : [];

      renderPhotoGrid();
      renderHighlightList();

      // Logo preview
      setLogoImg("#logoPreview", me.logoKey || me.logo_key || null);
    } catch (e) {
      const status = e?.status || e?.response?.status;
      if (status === 401 || status === 403) {
        location.replace("/login.html?next=/promo_me.html");
        return;
      }
      console.debug("loadMe:", e?.message || e);
    }
  }

  // ---------- init & events ----------
  async function init() {
    const state = await ensurePromoter();
    if (!state) return;

    const form = document.getElementById("promoForm");
    const saveBtn = document.getElementById("saveBtn");
    const logoInput = document.getElementById("logo");
    const logoPreview = document.getElementById("logoPreview");

    // Live logo preview + object URL cleanup
    logoInput?.addEventListener("change", () => {
      const f = logoInput.files?.[0];
      if (!f || !logoPreview) return;

      const err = assertFileAllowed(f, "image");
      if (err) {
        toast(err, "error");
        logoInput.value = "";
        return;
      }

      if (currentLogoObjectUrl) URL.revokeObjectURL(currentLogoObjectUrl);
      currentLogoObjectUrl = URL.createObjectURL(f);
      logoPreview.src = currentLogoObjectUrl;
    });

    // Add gallery photos (multi-upload)
    document.getElementById("addPhotosBtn")?.addEventListener("click", async () => {
      const input = document.getElementById("photoFiles");
      const files = Array.from(input?.files || []);
      if (!files.length) return;

      try {
        const uploaded = [];
        for (const f of files) {
          const err = assertFileAllowed(f, "image");
          if (err) {
            toast(err, "error");
            continue;
          }
          const key = await uploadGeneric(f, { actor: "promoter", type: "gallery", kind: "image" });
          if (key) uploaded.push(key);
        }
        if (uploaded.length) {
          mediaKeys = [...mediaKeys, ...uploaded];
          renderPhotoGrid();
        }
        if (input) input.value = "";
      } catch (e) {
        console.error(e);
        toast("Photo upload failed", "error");
      }
    });

    // Add highlight by URL
    document.getElementById("addHighlightUrlBtn")?.addEventListener("click", () => {
      const el = document.getElementById("highlightUrl");
      const u = (el?.value || "").trim();
      if (!u) return;
      const safe = safeHighlightUrl(u);
      if (!safe) {
        toast("Highlight URL must be https and from an allowed social/video site", "error");
        return;
      }
      highlights.push(safe);
      renderHighlightList();
      if (el) el.value = "";
    });

    // Upload highlight video file
    document.getElementById("uploadHighlightBtn")?.addEventListener("click", async () => {
      const input = document.getElementById("highlightFile");
      const f = input?.files?.[0];
      if (!f) return;

      const err = assertFileAllowed(f, "video");
      if (err) {
        toast(err, "error");
        return;
      }

      try {
        const key = await uploadGeneric(f, { actor: "promoter", type: "highlight", kind: "video" });
        if (key) {
          const val = typeof key === "string" && key.startsWith("public/") ? mediaUrl(key) : key;
          highlights.push(val);
          renderHighlightList();
        }
        if (input) input.value = "";
      } catch (e) {
        console.error(e);
        toast("Video upload failed", "error");
      }
    });

    // Save handler with cooldown (aligned with profile_me)
    let lastSaveAt = 0;
    const SAVE_COOLDOWN_MS = 3000;
    const SAVE_TIMEOUT_MS = 12_000;

    function withTimeout(promise, ms, aborter) {
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          try { aborter?.abort?.(); } catch {}
          reject(new Error("Request timed out"));
        }, ms);
        promise.then((v) => { clearTimeout(t); resolve(v); })
               .catch((e) => { clearTimeout(t); reject(e); });
      });
    }

    form?.addEventListener("submit", async (e) => {
      e.preventDefault();

      const now = Date.now();
      if (now - lastSaveAt < SAVE_COOLDOWN_MS) {
        toast("Saving too fast. Try again.", "error");
        return;
      }
      lastSaveAt = now;

      setDisabled(saveBtn, true, "Saving…");

      try {
        // Collect fields from inputs
        const data = {
          orgName: ($("#orgName")?.value || "").trim(),
          address: ($("#address")?.value || "").trim(),
          city: ($("#city")?.value || "").trim(),
          region: ($("#region")?.value || "").trim(),
          country: ($("#country")?.value || "").trim(),
          website: ($("#website")?.value || "").trim(),
          contact: ($("#contact")?.value || "").trim(),
          bio: ($("#bio")?.value || "").trim() || null,
        };

        // Socials (only include non-empty)
        const socials = {
          twitter: ($("#social_twitter")?.value || "").trim() || null,
          instagram: ($("#social_instagram")?.value || "").trim() || null,
          tiktok: ($("#social_tiktok")?.value || "").trim() || null,
          youtube: ($("#social_youtube")?.value || "").trim() || null,
          facebook: ($("#social_facebook")?.value || "").trim() || null,
          website: ($("#social_website")?.value || "").trim() || null,
        };
        Object.keys(socials).forEach((k) => {
          if (!socials[k]) delete socials[k];
        });
        if (Object.keys(socials).length) data.socials = socials;

        // Upload logo if provided
        const logoKey = await uploadLogoIfAny().catch(() => null);
        if (logoKey) data.logoKey = logoKey;

        // Attach media arrays
        data.mediaKeys = mediaKeys;
        data.highlights = highlights;

        // Save with timeout/abort
        const ac = new AbortController();
        const saved = await withTimeout(
          apiFetch("/profiles/promoters", { method: "PUT", body: data, signal: ac.signal }),
          SAVE_TIMEOUT_MS,
          ac
        );

        toast("Promotion saved!");

        // Ensure preview reflects any new logo immediately
        const newLogo =
          saved?.logoKey || saved?.logo_key || logoKey || null;
        if (newLogo && logoPreview) {
          setLogoImg(logoPreview, newLogo);
        }
      } catch (err) {
        console.error("promo save failed", err);
        toast(err?.message || "Save failed. Try again in a moment.", "error");
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
})();
