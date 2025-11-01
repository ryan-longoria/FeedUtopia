import { apiFetch, uploadToS3, uploadAvatar } from "/js/api.js";
import { getAuthState, isWrestler } from "/js/roles.js";
import { mediaUrl } from "/js/media.js";

(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const setVal = (id, v = "") => {
    const el = document.getElementById(id);
    if (el) el.value = v ?? "";
  };

  const AVATAR_BUST = Math.floor(Date.now() / (5 * 60 * 1000));
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
  const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const VIDEO_TYPES = new Set([
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/ogg",
  ]);

  let mediaKeys = [];
  let highlights = [];
  let originalHighlightsJSON = "[]";

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
    "www.youtube.com",
    "youtube.com",
    "youtu.be",
    // Vimeo
    "vimeo.com",
    "www.vimeo.com",
    // TikTok
    "www.tiktok.com",
    "tiktok.com",
    "vm.tiktok.com",
    // Instagram
    "www.instagram.com",
    "instagram.com",
    // Threads
    "www.threads.net",
    "threads.net",
    // X / Twitter
    "x.com",
    "www.x.com",
    "twitter.com",
    "www.twitter.com",
    // Facebook
    "www.facebook.com",
    "facebook.com",
  ]);

  if (MEDIA_BASE) {
    const h = getHostFromUrl(MEDIA_BASE);
    if (h) ALLOWED_HIGHLIGHT_HOSTS.add(h);
  }

  function safeHighlightUrlFromUser(raw) {
    try {
      const url = new URL(raw, location.origin);
      if (url.protocol !== "https:") return null;
      if (!ALLOWED_HIGHLIGHT_HOSTS.has(url.host)) return null;
      return url.toString();
    } catch {
      return null;
    }
  }

  function isKeyLike(val) {
    return (
      typeof val === "string" &&
      (val.startsWith("public/") ||
        val.startsWith("profiles/") ||
        val.startsWith("raw/"))
    );
  }

  function setImg(sel, key) {
    const el = $(sel);
    if (!el) return;
    if (!key) {
      el.src = "/assets/avatar-fallback.svg";
      return;
    }
    const url = mediaUrl(String(key));
    const needsBust =
      /^public\/wrestlers\/profiles\//.test(String(key)) ||
      /^profiles\//.test(String(key));
    el.src = needsBust ? `${url}?v=${AVATAR_BUST}` : url;
  }

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

  async function ensureWrestler() {
    const s = await getAuthState();
    if (!isWrestler(s)) {
      toast("Wrestler role required", "error");
      location.replace("index.html");
      return null;
    }
    return s;
  }

  function assertFileAllowed(file, kind = "image") {
    if (!file) return "No file selected";
    const typeSet = kind === "video" ? VIDEO_TYPES : IMAGE_TYPES;
    const max = kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (!typeSet.has(file.type)) return "Unsupported file type";
    if (file.size > max) return "File too large";
    return null;
  }

  function renderPhotoGrid() {
    const wrap = document.getElementById("photoGrid");
    if (!wrap) return;
    wrap.innerHTML = (mediaKeys || [])
      .map((k, i) => {
        const raw = typeof k === "string" && k.startsWith("raw/");
        const imgSrc = raw ? "/assets/image-processing.svg" : mediaUrl(k);
        return `
          <div class="media-card" data-i="${i}">
            <img src="${imgSrc}" alt="Profile media ${i}">
            <button class="btn secondary media-remove" type="button">Remove</button>
          </div>
        `;
      })
      .join("");
    wrap.onclick = (ev) => {
      const btn = ev.target.closest(".media-remove");
      if (!btn) return;
      const card = btn.closest("[data-i]");
      if (!card) return;
      const idx = Number(card.dataset.i);
      if (!Number.isFinite(idx)) return;
      mediaKeys.splice(idx, 1);
      renderPhotoGrid();
    };
  }

  function renderHighlightList() {
    const ul = document.getElementById("highlightList");
    if (!ul) return;
    ul.innerHTML = (highlights || [])
      .map((item, i) => {
        let display;
        if (typeof item === "string" && /^https?:\/\//i.test(item)) {
          display = item;
        } else if (isKeyLike(item)) {
          display = mediaUrl(item);
        } else {
          display = String(item);
        }
        return `
          <li data-i="${i}">
            <span style="flex:1; word-break:break-all">${display}</span>
            <button class="btn secondary" type="button">Remove</button>
          </li>
        `;
      })
      .join("");
    ul.onclick = (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      const li = btn.closest("[data-i]");
      if (!li) return;
      const idx = Number(li.dataset.i);
      if (!Number.isFinite(idx)) return;
      highlights.splice(idx, 1);
      renderHighlightList();
    };
  }

  function photoUrlFromKey(key) {
    return key ? mediaUrl(String(key)) : "/assets/avatar-fallback.svg";
  }

  function formToObj(form) {
    const fd = new FormData(form);
    const o = {};
    for (const [k, v] of fd.entries()) o[k] = v;
    o.heightIn = Number(o.heightIn);
    if (!Number.isFinite(o.heightIn)) delete o.heightIn;
    o.weightLb = Number(o.weightLb);
    if (!Number.isFinite(o.weightLb)) delete o.weightLb;
    o.bio = (o.bio || "").trim() || null;
    o.gimmicks = (o.gimmicks || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    o.socials = {
      twitter: (o.social_twitter || "").trim() || null,
      instagram: (o.social_instagram || "").trim() || null,
      tiktok: (o.social_tiktok || "").trim() || null,
      youtube: (o.social_youtube || "").trim() || null,
      website: (o.social_website || "").trim() || null,
    };
    Object.keys(o.socials).forEach((k) => {
      if (!o.socials[k]) delete o.socials[k];
    });
    const exp = (o.experienceYears || "").toString().trim();
    if (exp === "") {
      o.experienceYears = null;
    } else {
      const n = Number(exp);
      o.experienceYears = Number.isFinite(n) ? n : null;
    }
    o.achievements = (o.achievements || "").trim() || null;
    return o;
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

  async function uploadAvatarIfAny() {
    const fileInput = document.getElementById("avatar");
    const file = fileInput?.files?.[0];
    if (!file) return null;
    const err = assertFileAllowed(file, "image");
    if (err) {
      toast(err, "error");
      return null;
    }
    return await uploadAvatar(file);
  }

  async function loadMe() {
    try {
      const me = await apiFetch("/profiles/wrestlers/me");
      if (!me || !me.userId) return;

      mediaKeys = Array.isArray(me.mediaKeys) ? [...me.mediaKeys] : [];
      highlights = Array.isArray(me.highlights) ? [...me.highlights] : [];
      originalHighlightsJSON = JSON.stringify(highlights);

      renderPhotoGrid();
      renderHighlightList();

      window.profile = me;

      const map = {
        firstName: "firstName",
        middleName: "middleName",
        lastName: "lastName",
        stageName: "stageName",
        dob: "dob",
        city: "city",
        region: "region",
        country: "country",
        heightIn: "heightIn",
        weightLb: "weightLb",
        bio: "bio",
        experienceYears: "experienceYears",
        achievements: "achievements",
      };

      if (me.socials) {
        const s = me.socials;
        if (s.twitter) setVal("social_twitter", s.twitter);
        if (s.instagram) setVal("social_instagram", s.instagram);
        if (s.tiktok) setVal("social_tiktok", s.tiktok);
        if (s.youtube) setVal("social_youtube", s.youtube);
        if (s.website) setVal("social_website", s.website);
      }

      for (const [field, id] of Object.entries(map)) {
        if (me[field] !== undefined && me[field] !== null) {
          setVal(id, me[field]);
        }
      }

      if (Array.isArray(me.gimmicks) && me.gimmicks.length) {
        setVal("gimmicks", me.gimmicks.join(", "));
      }

      setImg(
        "#avatarPreview",
        me.photoKey ||
          me.avatar_key ||
          me.avatarKey ||
          me.photo_key ||
          null,
      );

      const vb = document.getElementById("viewBtn");
      if (vb) {
        vb.disabled = !me.handle;
        if (me.handle) vb.dataset.handle = me.handle;
      }
    } catch (e) {
      const status = e?.status || e?.response?.status;
      if (status === 401 || status === 403) {
        location.replace("/login.html?next=/profile_me.html");
        return;
      }
      console.debug("loadMe:", e?.message || e);
    }
  }

  function safeHandle(h) {
    const s = String(h || "");
    return /^[a-zA-Z0-9_-]+$/.test(s) ? s : null;
  }

  async function init() {
    const state = await ensureWrestler();
    if (!state) return;

    const form = document.getElementById("profileForm");
    const saveBtn = document.getElementById("saveBtn");
    const viewBtn = document.getElementById("viewBtn");
    const avatarInput = document.getElementById("avatar");
    const avatarPreview = document.getElementById("avatarPreview");

    avatarInput?.addEventListener("change", () => {
      const f = avatarInput.files?.[0];
      if (f && avatarPreview) {
        const err = assertFileAllowed(f, "image");
        if (err) {
          toast(err, "error");
          avatarInput.value = "";
          return;
        }
        avatarPreview.src = URL.createObjectURL(f);
      }
    });

    viewBtn?.addEventListener("click", () => {
      const handle = safeHandle(viewBtn?.dataset?.handle);
      if (handle) {
        location.href = `/w/#${handle}`;
        return;
      }

      const stageName = $("#stageName")?.value || "Wrestler";
      const first = $("#firstName")?.value || "";
      const middle = $("#middleName")?.value || "";
      const last = $("#lastName")?.value || "";
      const fullName = [first, middle, last].filter(Boolean).join(" ");
      const dob = $("#dob")?.value || "";
      const city = $("#city")?.value || "";
      const region = $("#region")?.value || "";
      const country = $("#country")?.value || "";
      const bio = $("#bio")?.value || "";
      const gimmicks = ($("#gimmicks")?.value || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const imgSrc = avatarPreview?.src || "/assets/avatar-fallback.svg";
      const loc = [city, region, country].filter(Boolean).join(", ");

      const html = `
        <div style="display:grid;grid-template-columns:120px 1fr;gap:16px">
          <img src="${imgSrc}" alt="Avatar" style="width:120px;height:120px;border-radius:999px;object-fit:cover;background:#0f1224;border:1px solid #1f2546"/>
          <div>
            <h2 style="margin:0">${stageName}</h2>
            <div class="muted">${loc}</div>
            <div class="chips mt-2">${gimmicks.map((g) => `<span class="chip">${g}</span>`).join("")}</div>
          </div>
        </div>
        <div class="mt-3">${bio ? `<p>${bio.replace(/\n/g, "<br/>")}</p>` : '<p class="muted">No bio yet.</p>'}</div>
        <dl class="mt-3">
          <dt class="muted">Name</dt><dd>${fullName}</dd>
          <dt class="muted mt-2">DOB</dt><dd>${dob}</dd>
        </dl>
      `;
      const box = document.getElementById("preview-content");
      if (box) box.innerHTML = html;
      document.getElementById("preview-modal")?.showDialog?.() ||
        document.getElementById("preview-modal")?.showModal();
    });

    {
      const photosSection = document.getElementById("photosSection");
      const videosSection = document.getElementById("videosSection");

      if (
        photosSection &&
        videosSection &&
        (photosSection.compareDocumentPosition(videosSection) &
          Node.DOCUMENT_POSITION_PRECEDING)
      ) {
        videosSection.after(photosSection);
      }
    }

    document
      .getElementById("addPhotosBtn")
      ?.addEventListener("click", async () => {
        const input = document.getElementById("photoFiles");
        const files = Array.from(input?.files || []);
        if (!files.length) return;
        for (const f of files) {
          const err = assertFileAllowed(f, "image");
          if (err) {
            toast(err, "error");
            continue;
          }
          const key = await uploadToS3(f.name, f.type || "image/jpeg", f, {
            actor: "wrestler",
            type: "gallery",
          });
          if (key) {
            mediaKeys.push(key);
          }
        }
        renderPhotoGrid();
        if (input) input.value = "";
      });

    document
      .getElementById("addHighlightUrlBtn")
      ?.addEventListener("click", () => {
        const el = document.getElementById("highlightUrl");
        const u = (el?.value || "").trim();
        if (!u) return;
        const safe = safeHighlightUrlFromUser(u);
        if (!safe) {
          toast(
            "Highlight URL must be https and from an allowed social/video site",
            "error",
          );
          return;
        }
        highlights.push(safe);
        renderHighlightList();
        el.value = "";
      });

    document
      .getElementById("uploadHighlightBtn")
      ?.addEventListener("click", async () => {
        const input = document.getElementById("highlightFile");
        const f = input?.files?.[0];
        if (!f) return;

        const err = assertFileAllowed(f, "video");
        if (err) {
          toast(err, "error");
          return;
        }

        const key = await uploadToS3(f.name, f.type || "video/mp4", f, {
          actor: "wrestler",
          type: "highlight",
        });

        if (key) {
          const val =
            typeof key === "string" && key.startsWith("public/")
              ? mediaUrl(key)
              : key;
          highlights.push(val);
          renderHighlightList();
        }
        if (input) input.value = "";
      });

    let lastSaveAt = 0;
    const SAVE_COOLDOWN_MS = 3000;

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
        const data = formToObj(form);
        const key = await uploadAvatarIfAny().catch(() => null);
        if (key) {
          data.photoKey = key;
          data.avatarKey = key;
          data.photo_key = key;
          data.avatar_key = key;
        }

        const payload = {
          stageName: data.stageName,
          firstName: data.firstName,
          middleName: data.middleName || null,
          lastName: data.lastName,
          dob: data.dob,
          city: data.city,
          region: data.region,
          country: data.country,
          heightIn: data.heightIn,
          weightLb: data.weightLb,
          bio: data.bio,
          gimmicks: data.gimmicks,
          socials: data.socials,
          experienceYears: data.experienceYears,
          achievements: data.achievements,
          photoKey: data.photoKey || null,
          avatarKey: data.avatarKey || null,
          photo_key: data.photo_key || null,
          avatar_key: data.avatar_key || null,
          mediaKeys,
        };

        const currentHighlightsJSON = JSON.stringify(highlights || []);
        if (currentHighlightsJSON !== originalHighlightsJSON) {
          payload.highlights = highlights;
        }

        const saved = await apiFetch("/profiles/wrestlers/me", {
          method: "PUT",
          body: payload,
        });

        toast("Profile saved!");

        if (saved?.handle && viewBtn) {
          const handle = safeHandle(saved.handle);
          if (handle) {
            viewBtn.disabled = false;
            viewBtn.dataset.handle = handle;
            viewBtn.onclick = () => {
              location.href = `/w/#${handle}`;
            };
          }
        }

        const newKey =
          saved?.photoKey ||
          saved?.avatarKey ||
          saved?.avatar_key ||
          saved?.photo_key ||
          data.photoKey ||
          data.avatarKey ||
          data.avatar_key ||
          data.photo_key;

        if (newKey && avatarPreview) {
          avatarPreview.src = photoUrlFromKey(newKey);
        }

        originalHighlightsJSON = currentHighlightsJSON;
      } catch (err) {
        console.error("profile save failed", err);
        toast("Save failed. Try again in a moment.", "error");
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
