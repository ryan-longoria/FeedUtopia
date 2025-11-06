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

  const GEO_BASE = "/geo";
  const geoCache = new Map();

  async function loadJSON(path) {
    if (geoCache.has(path)) return geoCache.get(path);
    const res = await fetch(path, { cache: "force-cache" });
    if (!res.ok) throw new Error(`Geo fetch failed ${res.status} for ${path}`);
    const data = await res.json();
    geoCache.set(path, data);
    return data;
  }
  async function loadCountriesNA() {
    return loadJSON(`${GEO_BASE}/countries.v1.json`);
  }
  async function loadStates(cc) {
    return loadJSON(`${GEO_BASE}/regions_${cc}.v1.json`);
  }
  async function loadCities(cc, stateCode) {
    return loadJSON(`${GEO_BASE}/${cc}/cities_${stateCode}.v1.json`);
  }
  function resetSel(sel, placeholder, disabled = false) {
    if (!sel) return;
    sel.innerHTML = `<option value="">${placeholder}</option>`;
    sel.disabled = !!disabled;
  }
  async function initLocationSelects(pref = {}) {
    const countrySel = document.getElementById("country");
    const regionSel  = document.getElementById("region");
    const citySel    = document.getElementById("city");
    if (!countrySel || !regionSel || !citySel) return;

    resetSel(countrySel, "Select Country");
    resetSel(regionSel,  "Select State/Region", true);
    resetSel(citySel,    "Select City", true);

    const countries = await loadCountriesNA().catch(() => []);
    for (const c of countries) {
      const opt = document.createElement("option");
      opt.value = c.code;
      opt.textContent = c.name;
      countrySel.appendChild(opt);
    }
    countrySel.disabled = countries.length === 0;

    countrySel.addEventListener("change", async () => {
      const cc = countrySel.value;
      resetSel(regionSel, "Select State/Region", !cc);
      resetSel(citySel, "Select City", true);
      if (!cc) return;

      const states = await loadStates(cc).catch(() => []);
      for (const s of states) {
        const opt = document.createElement("option");
        opt.value = s.code;
        opt.textContent = s.name;
        regionSel.appendChild(opt);
      }
      regionSel.disabled = states.length === 0;
    });

    regionSel.addEventListener("change", async () => {
      const cc = countrySel.value;
      const sc = regionSel.value;
      resetSel(citySel, "Select City", !cc || !sc);
      if (!cc || !sc) return;

      const cities = await loadCities(cc, sc).catch(() => []);
      for (const name of cities) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        citySel.appendChild(opt);
      }
      citySel.disabled = cities.length === 0;
    });

    if (pref.country) {
      countrySel.value = pref.country;
      const states = await loadStates(pref.country).catch(() => []);
      resetSel(regionSel, "Select State/Region", false);
      for (const s of states) {
        const opt = document.createElement("option");
        opt.value = s.code;
        opt.textContent = s.name;
        regionSel.appendChild(opt);
      }
      if (pref.region) regionSel.value = pref.region;

      if (pref.region) {
        const cities = await loadCities(pref.country, pref.region).catch(() => []);
        resetSel(citySel, "Select City", false);
        for (const name of cities) {
          const opt = document.createElement("option");
          opt.value = name;
          opt.textContent = name;
          citySel.appendChild(opt);
        }
        if (pref.city) citySel.value = pref.city;
      }
    }
  }

  const AVATAR_BUST = Math.floor(Date.now() / (5 * 60 * 1000));

  const avatarCropper = (() => {
  let stage, imgEl, zoomEl, resetEl, hidX, hidY, hidS;

  const crop = {
    scale: 1,
    minScale: 1,
    offsetX: 0,
    offsetY: 0,
    imgW: 0,
    imgH: 0,
    stageW: 160,
    stageH: 160,
    dragging: false,
    dragStartX: 0,
    dragStartY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
  };

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function updateHidden() {
    if (!hidX || !hidY || !hidS) return;
    hidX.value = String(Math.round(crop.offsetX));
    hidY.value = String(Math.round(crop.offsetY));
    hidS.value = String(Number(crop.scale.toFixed(3)));
  }
  function applyTransform() {
    if (!imgEl) return;
    imgEl.style.transform =
      `translate(calc(-50% + ${crop.offsetX}px), calc(-50% + ${crop.offsetY}px)) scale(${crop.scale})`;
    if (zoomEl) zoomEl.value = String(crop.scale);
    updateHidden();
  }
  function computeMinScale() {
    if (!crop.imgW || !crop.imgH) return;
    const needW = crop.stageW / crop.imgW;
    const needH = crop.stageH / crop.imgH;
    crop.minScale = Math.max(needW, needH, 1);
    if (crop.scale < crop.minScale) crop.scale = crop.minScale;
  }
  function clampOffsets() {
    const halfW = (crop.imgW * crop.scale) / 2;
    const halfH = (crop.imgH * crop.scale) / 2;
    const maxX = Math.max(0, halfW - crop.stageW / 2);
    const maxY = Math.max(0, halfH - crop.stageH / 2);
    crop.offsetX = clamp(crop.offsetX, -maxX, maxX);
    crop.offsetY = clamp(crop.offsetY, -maxY, maxY);
  }
  function recalcAndRender() {
    computeMinScale();
    clampOffsets();
    applyTransform();
  }

  function bindDOM() {
    stage   = document.getElementById("avatarStage");
    imgEl   = document.getElementById("avatarPreview");
    zoomEl  = document.getElementById("avatarZoom");
    resetEl = document.getElementById("avatarReset");
    hidX    = document.getElementById("avatarCropX");
    hidY    = document.getElementById("avatarCropY");
    hidS    = document.getElementById("avatarCropScale");

    if (!stage || !imgEl) return;

    zoomEl?.addEventListener("input", () => {
      const prev = crop.scale;
      const next = clamp(parseFloat(zoomEl.value) || prev, crop.minScale, 3);
      const factor = next / prev;
      crop.offsetX *= factor;
      crop.offsetY *= factor;
      crop.scale = next;
      clampOffsets();
      applyTransform();
    });

    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      const prev = crop.scale;
      const next = clamp(prev + (-Math.sign(e.deltaY) * 0.06), crop.minScale, 3);
      const factor = next / prev;
      crop.offsetX *= factor;
      crop.offsetY *= factor;
      crop.scale = next;
      clampOffsets();
      applyTransform();
    }, { passive: false });

    stage.addEventListener("pointerdown", (e) => {
      crop.dragging = true;
      stage.setPointerCapture(e.pointerId);
      crop.dragStartX = e.clientX;
      crop.dragStartY = e.clientY;
      crop.startOffsetX = crop.offsetX;
      crop.startOffsetY = crop.offsetY;
    });
    stage.addEventListener("pointermove", (e) => {
      if (!crop.dragging) return;
      const dx = e.clientX - crop.dragStartX;
      const dy = e.clientY - crop.dragStartY;
      crop.offsetX = crop.startOffsetX + dx;
      crop.offsetY = crop.startOffsetY + dy;
      clampOffsets();
      applyTransform();
    });
    stage.addEventListener("pointerup", (e) => {
      crop.dragging = false;
      stage.releasePointerCapture(e.pointerId);
    });
    stage.addEventListener("pointercancel", () => { crop.dragging = false; });

    resetEl?.addEventListener("click", () => {
      crop.offsetX = 0; crop.offsetY = 0; crop.scale = Math.max(1, crop.minScale);
      recalcAndRender();
    });
  }

  function initFromImageNaturalSize() {
    if (!imgEl) return;
    const init = () => {
      crop.imgW = imgEl.naturalWidth || 0;
      crop.imgH = imgEl.naturalHeight || 0;
      const r = stage.getBoundingClientRect();
      crop.stageW = r.width; crop.stageH = r.height;
      const persistedScale = parseFloat(hidS?.value) || 1;
      const persistedX = parseFloat(hidX?.value) || 0;
      const persistedY = parseFloat(hidY?.value) || 0;
      computeMinScale();
      crop.scale = Math.max(persistedScale, crop.minScale);
      crop.offsetX = persistedX;
      crop.offsetY = persistedY;
      recalcAndRender();
    };
    if (imgEl.naturalWidth && imgEl.naturalHeight) init();
    else imgEl.addEventListener("load", init, { once: true });
  }

  return {
    bindDOM,
    onImageChanged() { initFromImageNaturalSize(); },
    loadPersisted(obj) {
      if (!obj) return;
      if (typeof obj.x === "number")  hidX && (hidX.value = String(obj.x));
      if (typeof obj.y === "number")  hidY && (hidY.value = String(obj.y));
      if (typeof obj.scale === "number") hidS && (hidS.value = String(obj.scale));
    },
    readForPayload() {
      return {
        x: Number(hidX?.value) || 0,
        y: Number(hidY?.value) || 0,
        scale: Number(hidS?.value) || 1,
      };
    }
  };
})();

  const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
  const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25 MB
  const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const VIDEO_TYPES = new Set([
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/ogg",
  ]);

  let mediaKeys = [];
  let highlights = [];

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
    // LinkedIn
    "www.linkedin.com",
    "linkedin.com",
  ]);

  if (MEDIA_BASE) {
    const h = getHostFromUrl(MEDIA_BASE);
    if (h) ALLOWED_HIGHLIGHT_HOSTS.add(h);
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

  function safeHighlightUrl(raw) {
    try {
      const url = new URL(raw, location.origin);
      if (url.protocol !== "https:") return null;
      if (!ALLOWED_HIGHLIGHT_HOSTS.has(url.host)) return null;
      return url.toString();
    } catch {
      return null;
    }
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
    o.gimmicksText = (o.gimmicksText || "").toString().trim().slice(0, 500);

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
    if (_avatarCroppedBlob) {
      return await uploadAvatar(new File([_avatarCroppedBlob], "avatar.png", { type: "image/png" }));
    }
    const fileInput = document.getElementById("avatar");
    const file = fileInput?.files?.[0];
    if (!file) return null;

    const err = assertFileAllowed(file, "image");
    if (err) { toast(err, "error"); return null; }

    return await uploadAvatar(file);
  }

  async function loadMe() {
    try {
      const me = await apiFetch("/profiles/wrestlers/me");
      if (!me || !me.userId) return;

      mediaKeys = Array.isArray(me.mediaKeys) ? [...me.mediaKeys] : [];

      highlights = Array.isArray(me.highlights)
        ? me.highlights
            .map((item) => {
              if (typeof item === "string") {
                const s = item.trim();
                if (!s) return null;
                try {
                  const u = new URL(s);
                  if (u.protocol === "https:") return u.toString();
                } catch {
                  if (
                    s.startsWith("public/") ||
                    s.startsWith("profiles/") ||
                    s.startsWith("raw/")
                  ) {
                    return s;
                  }
                  return null;
                }
              }
              if (item && typeof item === "object") {
                if (typeof item.url === "string") return item.url;
                if (typeof item.href === "string") return item.href;
                if (typeof item.src === "string") return item.src;
                if (typeof item.key === "string") return item.key;
              }
              return null;
            })
            .filter(Boolean)
        : [];

      renderPhotoGrid();
      renderHighlightList();

      window.profile = me;

      await initLocationSelects({
        country: me.country || "",
        region:  me.region || "",
        city:    me.city || "",
      });

      const map = {
        firstName: "firstName",
        middleName: "middleName",
        lastName: "lastName",
        stageName: "stageName",
        dob: "dob",
        heightIn: "heightIn",
        weightLb: "weightLb",
        bio: "bio",
        experienceYears: "experienceYears",
        achievements: "achievements",
      };

      const gimmicksTxt = (typeof me.gimmicksText === "string" ? me.gimmicksText : "")
        || (Array.isArray(me.gimmicks) ? me.gimmicks.filter(Boolean).join(", ") : "");
      setVal("gimmicksText", gimmicksTxt);

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

      setImg(
        "#avatarPreview",
        me.photoKey ||
          me.avatar_key ||
          me.avatarKey ||
          me.photo_key ||
          null,
      );

      if (me.avatarCrop) avatarCropper.loadPersisted(me.avatarCrop);
      avatarCropper.onImageChanged();

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

    await initLocationSelects({});

    avatarCropper.bindDOM();

    let _avatarCroppedBlob = null;

    async function exportCircularPNGFromCanvas(srcImg, view, outSize = 1024) {
      const out = document.createElement("canvas");
      out.width = out.height = outSize;
      const ctx = out.getContext("2d");

      ctx.clearRect(0, 0, outSize, outSize);
      ctx.save();
      ctx.beginPath();
      ctx.arc(outSize/2, outSize/2, outSize/2, 0, Math.PI*2);
      ctx.closePath();
      ctx.clip();

      const scale = view.scale * (outSize / 512);
      const tx = view.tx * (outSize / 512);
      const ty = view.ty * (outSize / 512);

      ctx.translate(outSize/2 + tx, outSize/2 + ty);
      ctx.scale(scale, scale);
      ctx.drawImage(srcImg, -srcImg.width/2, -srcImg.height/2);
      ctx.restore();

      return new Promise((resolve) => out.toBlob((b)=>resolve(b), "image/png"));
    }

    function renderLivePreview(srcImg, view) {
      const el = document.getElementById("avatar-preview-live");
      if (!el) return;
      const size = 128;
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const ctx = c.getContext("2d");
      ctx.clearRect(0,0,size,size);

      ctx.save();
      ctx.beginPath();
      ctx.arc(size/2, size/2, size/2, 0, Math.PI*2);
      ctx.closePath();
      ctx.clip();

      const scale = view.scale * (size / 512);
      const tx = view.tx * (size / 512);
      const ty = view.ty * (size / 512);

      ctx.translate(size/2 + tx, size/2 + ty);
      ctx.scale(scale, scale);
      ctx.drawImage(srcImg, -srcImg.width/2, -srcImg.height/2);
      ctx.restore();

      el.src = c.toDataURL("image/png");
    }

    async function openAvatarCropper(file) {
      const dlg = document.getElementById("avatar-cropper");
      const canvas = document.getElementById("avatar-canvas");
      if (!dlg || !canvas) return;

      const ctx = canvas.getContext("2d");
      const bmp = await createImageBitmap(file);

      const fitScale = Math.max(512 / bmp.width, 512 / bmp.height);

      const view = {
        scale: fitScale,
        tx: 0,
        ty: 0
      };

      let dragging = false;
      let lastX = 0, lastY = 0;

      function draw() {
        ctx.clearRect(0,0,512,512);
        ctx.save();
        ctx.translate(256 + view.tx, 256 + view.ty);
        ctx.scale(view.scale, view.scale);
        ctx.drawImage(bmp, -bmp.width/2, -bmp.height/2);
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(256, 256, 255, 0, Math.PI*2);
        ctx.stroke();
        ctx.restore();

        renderLivePreview(bmp, view);
      }

      canvas.onpointerdown = (e)=>{ dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId); };
      canvas.onpointermove = (e)=>{
        if (!dragging) return;
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        view.tx += dx;
        view.ty += dy;
        draw();
      };
      canvas.onpointerup = (e)=>{ dragging = false; canvas.releasePointerCapture(e.pointerId); };
      canvas.onpointercancel = ()=>{ dragging = false; };

      canvas.onwheel = (e)=>{
        e.preventDefault();
        const factor = (e.deltaY < 0) ? 1.07 : 0.93;
        view.scale = Math.max(fitScale * 0.5, Math.min(view.scale * factor, fitScale * 8));
        draw();
      };

      document.getElementById("avatar-zoom-in")?.addEventListener("click", ()=>{ view.scale = Math.min(view.scale * 1.1, fitScale*8); draw(); });
      document.getElementById("avatar-zoom-out")?.addEventListener("click", ()=>{ view.scale = Math.max(view.scale / 1.1, fitScale*0.5); draw(); });
      document.getElementById("avatar-reset")?.addEventListener("click", ()=>{ view.scale = fitScale; view.tx = 0; view.ty = 0; draw(); });

      const onCancel = ()=> dlg.close();
      const onAccept = async ()=>{
        const blob = await exportCircularPNGFromCanvas(bmp, view, 1024);
        _avatarCroppedBlob = blob;
        const url = URL.createObjectURL(blob);
        const avatarPreview = document.getElementById("avatarPreview");
        if (avatarPreview) avatarPreview.src = url;
        dlg.close();
      };

      const btnCancel = document.getElementById("avatar-cancel");
      const btnAccept = document.getElementById("avatar-accept");
      btnCancel?.addEventListener("click", onCancel, { once:true });
      btnAccept?.addEventListener("click", onAccept, { once:true });

      if (!dlg.open) dlg.showModal();
      draw();
    }

    avatarInput?.addEventListener("change", () => {
      const f = avatarInput.files?.[0];
      if (!f) return;
      const err = assertFileAllowed(f, "image");
      if (err) {
        toast(err, "error");
        avatarInput.value = "";
        return;
      }
      openAvatarCropper(f);
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
      const gimmicksText = $("#gimmicksText")?.value || "";
      const imgSrc = avatarPreview?.src || "/assets/avatar-fallback.svg";
      const loc = [city, region, country].filter(Boolean).join(", ");

      const html = `
        <div style="display:grid;grid-template-columns:120px 1fr;gap:16px">
          <img src="${imgSrc}" alt="Avatar" style="width:120px;height:120px;border-radius:999px;object-fit:cover;background:#0f1224;border:1px solid #1f2546"/>
          <div>
            <h2 style="margin:0">${stageName}</h2>
            <div class="muted">${loc}</div>
            <div class="mt-2" style="white-space:pre-line">${gimmicksText || '<span class="muted">No gimmicks added.</span>'}</div>
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
      document.getElementById("preview-modal")?.showModal();
    });

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
        const safe = safeHighlightUrl(u);
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
          gimmicksText: data.gimmicksText || null,
          gimmicks: (data.gimmicksText || "")
            .split(/[,;\n]/)
            .map(s => s.trim())
            .filter(Boolean)
            .slice(0, 10),
          socials: data.socials,
          experienceYears: data.experienceYears,
          achievements: data.achievements,
          photoKey: data.photoKey || null,
          avatarKey: data.avatarKey || null,
          photo_key: data.photo_key || null,
          avatar_key: data.avatar_key || null,
          mediaKeys,
          highlights,
          avatarCrop: avatarCropper.readForPayload(),
        };

        const saved = await apiFetch("/profiles/wrestlers/me", {
          method: "PUT",
          body: payload,
        });
        _avatarCroppedBlob = null;

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
