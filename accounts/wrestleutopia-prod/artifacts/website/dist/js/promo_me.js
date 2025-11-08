import { apiFetch, uploadToS3, md5Base64 } from "/js/api.js";
import { getAuthState, isPromoter } from "/js/roles.js";
import { mediaUrl } from "/js/media.js";

(() => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const setVal = (id, v = "") => {
    const el = document.getElementById(id);
    if (el) el.value = v ?? "";
  };

  const AVATAR_BUST = Math.floor(Date.now());
  let _logoCroppedBlob = null;

  const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
  const MAX_VIDEO_BYTES = 25 * 1024 * 1024; // 25 MB
  const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm", "video/ogg"]);
  const ENABLE_PRESIGN = false;

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

  const countrySel = () => document.getElementById("country");
  const regionSel  = () => document.getElementById("region");
  const citySel    = () => document.getElementById("city");

  function resetSel(sel, placeholder, disabled = false) {
    if (!sel) return;
    sel.innerHTML = `<option value="">${placeholder}</option>`;
    sel.disabled = !!disabled;
  }

  async function populateCountries() {
    const cSel = countrySel();
    resetSel(cSel, "Select Country");
    try {
      const list = await loadCountriesNA();
      for (const c of list) {
        const opt = document.createElement("option");
        opt.value = c.code;
        opt.textContent = c.name;
        cSel.appendChild(opt);
      }
      cSel.disabled = false;
    } catch (err) {
      console.error("[promo] countries load failed", err);
      resetSel(cSel, "Country data unavailable", true);
    }
  }

  async function populateRegions(cc, preselect) {
    const rSel = regionSel();
    const cSel = citySel();
    resetSel(rSel, "Select State/Region", !cc);
    resetSel(cSel, "Select City", true);
    if (!cc) return;
    try {
      const states = await loadStates(cc);
      for (const s of states) {
        const opt = document.createElement("option");
        opt.value = s.code;
        opt.textContent = s.name;
        rSel.appendChild(opt);
      }
      rSel.disabled = states.length === 0;
      if (preselect && states.some((s) => s.code === preselect)) {
        rSel.value = preselect;
      }
    } catch (err) {
      console.error("[promo] states load failed", err);
      resetSel(rSel, "Regions unavailable", true);
    }
  }

  async function populateCities(cc, stateCode, preselect) {
    const cSel = citySel();
    resetSel(cSel, "Select City", !cc || !stateCode);
    if (!cc || !stateCode) return;
    try {
      const cities = await loadCities(cc, stateCode);
      for (const name of cities) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        cSel.appendChild(opt);
      }
      cSel.disabled = cities.length === 0;
      if (preselect && cities.includes(preselect)) {
        cSel.value = preselect;
      }
    } catch (err) {
      console.error("[promo] cities load failed", err);
      resetSel(cSel, "Cities unavailable", true);
    }
  }

  async function initGeoIfNeeded() {
    const cSel = countrySel();
    const rSel = regionSel();
    const ciSel = citySel();
    if (cSel && cSel.options.length <= 1) {
      await populateCountries();
      resetSel(rSel, "Select State/Region", true);
      resetSel(ciSel, "Select City", true);
    }
  }

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

  async function exportCircularPNGFromCanvas(srcBmp, view, outSize = 1024) {
    const out = document.createElement("canvas");
    out.width = out.height = outSize;
    const ctx = out.getContext("2d");

    ctx.clearRect(0, 0, outSize, outSize);

    ctx.save();
    ctx.beginPath();
    ctx.arc(outSize / 2, outSize / 2, outSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const scale = view.scale * (outSize / 512);
    const tx = view.tx * (outSize / 512);
    const ty = view.ty * (outSize / 512);

    ctx.translate(outSize / 2 + tx, outSize / 2 + ty);
    ctx.scale(scale, scale);
    ctx.drawImage(srcBmp, -srcBmp.width / 2, -srcBmp.height / 2);
    ctx.restore();

    return new Promise((resolve) => out.toBlob((b) => resolve(b), "image/png"));
  }

  function renderLogoLivePreview(srcBmp, view) {
    const imgEl = document.getElementById("logo-preview-live");
    if (!imgEl) return;

    const size = 128;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, size, size);

    const scale = view.scale * (size / 512);
    const tx = view.tx * (size / 512);
    const ty = view.ty * (size / 512);

    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.translate(size / 2 + tx, size / 2 + ty);
    ctx.scale(scale, scale);
    ctx.drawImage(srcBmp, -srcBmp.width / 2, -srcBmp.height / 2);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    imgEl.src = c.toDataURL("image/png");
  }

  async function openLogoCropper(file) {
    const dlg = document.getElementById("logo-cropper");
    const canvas = document.getElementById("logo-canvas");
    if (!dlg || !canvas) return;

    const ctx = canvas.getContext("2d");
    const bmp = await createImageBitmap(file);

    const fitScale = Math.max(512 / bmp.width, 512 / bmp.height);
    const view = { scale: fitScale, tx: 0, ty: 0 };

    const MIN_SCALE = fitScale * 0.5;
    const MAX_SCALE = fitScale * 6;

    function clamp(v, lo, hi) {
      return Math.min(hi, Math.max(lo, v));
    }

    function zoomAt(deltaY, clientX, clientY) {
      const step = (typeof deltaY === "number" ? deltaY : 0);
      const normalized = step * (event?.deltaMode === 1 ? 16 : 1);

      const factor = Math.exp(-normalized / 300);

      const prev = view.scale;
      const next = clamp(prev * factor, MIN_SCALE, MAX_SCALE);
      if (next === prev) return;

      const rect = canvas.getBoundingClientRect();
      const cx = clientX - rect.left - 256;
      const cy = clientY - rect.top  - 256;

      const k = next / prev - 1;
      view.tx -= cx * k;
      view.ty -= cy * k;

      clampPan();
      view.scale = next;
      draw();
    }

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      zoomAt(e.deltaY, e.clientX, e.clientY);
    }, { passive: false });

    function clampPan() {
      const halfW = (bmp.width * view.scale) / 2;
      const halfH = (bmp.height * view.scale) / 2;
      const maxTx = Math.max(0, halfW - 256);
      const maxTy = Math.max(0, halfH - 256);
      view.tx = Math.min(maxTx, Math.max(-maxTx, view.tx));
      view.ty = Math.min(maxTy, Math.max(-maxTy, view.ty));
    }

    function draw() {
      ctx.clearRect(0, 0, 512, 512);
      ctx.save();
      ctx.translate(256 + view.tx, 256 + view.ty);
      ctx.scale(view.scale, view.scale);
      ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
      ctx.restore();

      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.rect(0, 0, 512, 512);
      ctx.moveTo(256, 256);
      ctx.arc(256, 256, 256, 0, Math.PI * 2, true);
      ctx.fill("evenodd");
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(256, 256, 255, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      renderLogoLivePreview(bmp, view);
    }

    let dragging = false;
    let lastX = 0, lastY = 0;

    canvas.onpointerdown = (e) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      lastX = e.clientX;
      lastY = e.clientY;
    };

    canvas.onpointermove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      view.tx += dx;
      view.ty += dy;
      clampPan();
      draw();
    };

    canvas.onpointerup = (e) => {
      dragging = false;
      canvas.releasePointerCapture(e.pointerId);
    };

    canvas.onpointercancel = () => { dragging = false; };

    canvas.onwheel = (e) => { e.preventDefault(); };

    const btnCancel = document.getElementById("logo-cancel");
    const btnAccept = document.getElementById("logo-accept");

    const onCancel = () => dlg.close();

    const onAccept = async () => {
      const blob = await exportCircularPNGFromCanvas(bmp, view, 1024);
      _logoCroppedBlob = blob;
      const logoPreview = document.getElementById("logoPreview");
      if (logoPreview) {
        const url = URL.createObjectURL(blob);
        logoPreview.src = url;
      }
      dlg.close();
    };

    btnCancel?.addEventListener("click", onCancel, { once: true });
    btnAccept?.addEventListener("click", onAccept, { once: true });

    if (!dlg.open) dlg.showModal();
    draw();
  }


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

  async function ensurePromoter() {
    const s = await getAuthState();
    if (!isPromoter(s)) {
      toast("Promoter role required", "error");
      location.replace("/login.html?next=/promo_me.html");
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
      if (url.origin === location.origin) return url.toString();
      if (!ALLOWED_HIGHLIGHT_HOSTS.has(url.host)) return null;
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

  function renderPhotoGrid() {
    const wrap = document.getElementById("photoGrid");
    if (!wrap) return;
    wrap.textContent = "";

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

    if (ENABLE_PRESIGN) {
      try {
        const md5b64 = await md5Base64(file).catch(() => null);
        const presign = await apiFetch("/media/presign", {
          method: "POST",
          body: {
            filename: file.name,
            contentType: file.type || "application/octet-stream",
            md5: md5b64 || undefined,
            ...meta,
          },
        });
        if (presign?.uploadUrl && presign?.objectKey) {
          await putViaPresign(presign, file, md5b64 || "");
          return presign.objectKey;
        }
      } catch (_) {
      }
    }

    return uploadToS3(file.name, file.type || "application/octet-stream", file, meta);
  }

  let currentLogoObjectUrl = null;
  async function uploadLogoIfAny() {
    if (_logoCroppedBlob) {
      const pngFile = new File([_logoCroppedBlob], "logo.png", { type: "image/png" });
      return uploadGeneric(pngFile, { actor: "promoter", type: "logo", kind: "image" });
    }

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

  async function loadMe() {
    try {
      const me = await apiFetch("/profiles/promoters/me");
      if (!me || !me.userId) {
        await initGeoIfNeeded();
        return;
      }

      setVal("orgName", me.orgName);
      setVal("address", me.address);
      setVal("website", me.website);
      setVal("contact", me.contact);
      setVal("bio", me.bio);

      await initGeoIfNeeded();
      const cc = (me.country || "").trim();
      const st = (me.region || "").trim();
      const ci = (me.city || "").trim();

      if (cc) {
        countrySel().value = cc;
        await populateRegions(cc, st || undefined);
        if (st) {
          await populateCities(cc, st, ci || undefined);
        }
      }
      if (me.socials && typeof me.socials === "object") {
        const s = me.socials;
        if (s.twitter) setVal("social_twitter", s.twitter);
        if (s.instagram) setVal("social_instagram", s.instagram);
        if (s.tiktok) setVal("social_tiktok", s.tiktok);
        if (s.youtube) setVal("social_youtube", s.youtube);
        if (s.facebook) setVal("social_facebook", s.facebook);
        if (s.website) setVal("social_website", s.website);
      }

      mediaKeys = Array.isArray(me.mediaKeys) ? [...me.mediaKeys] : [];

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

      setLogoImg("#logoPreview", me.logoKey || me.logo_key || null);
    } catch (e) {
      const status = e?.status || e?.response?.status;
      if (status === 401 || status === 403) {
        location.replace("/login.html?next=/promo_me.html");
        return;
      }
      console.debug("loadMe:", e?.message || e);
      await initGeoIfNeeded();
    }
  }

  async function init() {
    const state = await ensurePromoter();
    if (!state) return;

    const cSel = countrySel();
    const rSel = regionSel();
    const ciSel = citySel();

    cSel?.addEventListener("change", () => {
      const cc = cSel.value;
      populateRegions(cc);
    });
    rSel?.addEventListener("change", () => {
      const cc = cSel.value;
      const sc = rSel.value;
      populateCities(cc, sc);
    });

    const form = document.getElementById("promoForm");
    const saveBtn = document.getElementById("saveBtn");
    const logoInput = document.getElementById("logo");
    const logoPreview = document.getElementById("logoPreview");

    logoInput?.addEventListener("change", () => {
      const f = logoInput.files?.[0];
      if (!f) return;

      const err = assertFileAllowed(f, "image");
      if (err) {
        toast(err, "error");
        logoInput.value = "";
        return;
      }

      openLogoCropper(f);
    });

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
        const data = {
          orgName: ($("#orgName")?.value || "").trim(),
          address: ($("#address")?.value || "").trim(),
          city: (citySel()?.value || "").trim(),
          region: (regionSel()?.value || "").trim(),
          country: (countrySel()?.value || "").trim(),
          website: ($("#website")?.value || "").trim(),
          contact: ($("#contact")?.value || "").trim(),
          bio: ($("#bio")?.value || "").trim() || null,
        };

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

        const logoKey = await uploadLogoIfAny().catch(() => null);
        if (logoKey) data.logoKey = logoKey;

        data.mediaKeys = mediaKeys;
        data.highlights = highlights;

        const ac = new AbortController();
        const saved = await withTimeout(
          apiFetch("/profiles/promoters", { method: "PUT", body: data, signal: ac.signal }),
          SAVE_TIMEOUT_MS,
          ac
        );

        toast("Promotion saved!");
        _logoCroppedBlob = null;

        const newLogo = saved?.logoKey || saved?.logo_key || logoKey || null;
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

    await initGeoIfNeeded();
    await loadMe();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
