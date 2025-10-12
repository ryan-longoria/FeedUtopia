import { g as getAuthState, u as uploadToS3, a as apiFetch, i as isPromoter, m as md5Base64 } from "./core.js";
import { mediaUrl } from "./media.js";
import "https://esm.sh/aws-amplify@6";
import "https://esm.sh/aws-amplify@6/auth";
import "https://esm.sh/aws-amplify@6/utils";
const setVal = (id, v = "") => {
  const el = document.getElementById(id);
  if (el) el.value = v ?? "";
};
const getVal = (id) => {
  var _a;
  return (((_a = document.getElementById(id)) == null ? void 0 : _a.value) ?? "").trim();
};
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
  if (raw.startsWith("s3://")) {
    raw = raw.slice("s3://".length);
    const firstSlash = raw.indexOf("/");
    raw = firstSlash >= 0 ? raw.slice(firstSlash + 1) : raw;
  }
  if (/^(public\/(wrestlers|promoters)\/|raw\/uploads\/)/.test(raw)) return raw;
  if (/^user\//.test(raw)) return raw;
  const fname = raw.split("/").pop() || `file-${Date.now()}`;
  return sub ? `user/${sub}/${fname}` : `user/unknown/${fname}`;
}
function toast(text, type = "success") {
  const t = document.querySelector("#toast");
  if (!t) return console[type === "error" ? "error" : "log"](text);
  t.textContent = text;
  t.classList.toggle("error", type === "error");
  t.style.display = "block";
  setTimeout(() => t.style.display = "none", 2400);
}
(window.WU_MEDIA_BASE || "").replace(/\/+$/, "");
const setLogoImg = (el, key) => {
  if (!el) return;
  if (!key) {
    el.src = "/assets/avatar-fallback.svg";
    return;
  }
  const url = mediaUrl(String(key));
  const needsBust = /^public\/promoters\/profiles\//.test(String(key)) || /^profiles\//.test(String(key));
  el.src = needsBust ? `${url}?v=${Date.now()}` : url;
};
let mediaKeys = [];
let highlights = [];
function renderPhotoGrid() {
  const wrap2 = document.getElementById("photoGrid");
  if (!wrap2) return;
  wrap2.innerHTML = (mediaKeys || []).map((k, i) => {
    const raw = typeof k === "string" && k.startsWith("raw/");
    const imgSrc = raw ? "/assets/image-processing.svg" : mediaUrl(k);
    return `
      <div class="media-card">
        <img src="${imgSrc}" alt="">
        <button class="btn secondary media-remove" type="button" data-i="${i}">Remove</button>
      </div>
    `;
  }).join("");
}
function renderHighlightList() {
  const ul = document.getElementById("highlightList");
  if (!ul) return;
  ul.innerHTML = (highlights || []).map(
    (u, i) => `
    <li>
      <span style="flex:1; word-break:break-all">${u}</span>
      <button class="btn secondary" type="button" data-i="${i}">Remove</button>
    </li>
  `
  ).join("");
  wrap.querySelectorAll(".media-remove").forEach((btn) => {
    btn.onclick = () => {
      mediaKeys.splice(Number(btn.dataset.i), 1);
      renderPhotoGrid();
    };
  });
  ul.querySelectorAll("button").forEach((btn) => {
    btn.onclick = () => {
      highlights.splice(Number(btn.dataset.i), 1);
      renderHighlightList();
    };
  });
}
async function uploadLogoIfAny() {
  var _a, _b;
  const file = (_b = (_a = document.getElementById("logo")) == null ? void 0 : _a.files) == null ? void 0 : _b[0];
  if (!file) return null;
  try {
    const md5b64 = await md5Base64(file);
    if (typeof apiFetch === "function") {
      const presign = await apiFetch("/profiles/promoters/me/logo-url", {
        method: "POST",
        headers: { "Content-MD5": md5b64 },
        body: { contentType: file.type || "image/jpeg" }
      });
      if ((presign == null ? void 0 : presign.uploadUrl) && (presign == null ? void 0 : presign.objectKey)) {
        await fetch(presign.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": presign.contentType || file.type || "image/jpeg",
            "x-amz-server-side-encryption": "AES256",
            "Content-MD5": md5b64
          },
          body: file
        });
        return presign.objectKey;
      }
    }
  } catch (_) {
  }
  return await uploadToS3(file.name, file.type || "image/jpeg", file);
}
async function ensurePromoter() {
  const state = await getAuthState();
  if (!state || !isPromoter(state)) {
    toast("Please sign in as a promoter.", "error");
    return null;
  }
  document.body.classList.add("authenticated");
  return state;
}
async function loadMe() {
  try {
    const me = await apiFetch("/profiles/promoters/me", { method: "GET" });
    setVal("orgName", me.orgName);
    setVal("address", me.address);
    setVal("city", me.city);
    setVal("region", me.region);
    setVal("country", me.country);
    setVal("website", me.website);
    setVal("contact", me.contact);
    setVal("bio", me.bio);
    if (me.socials && typeof me.socials === "object") {
      for (const [k, v] of Object.entries(me.socials)) {
        setVal(`social_${k}`, v);
      }
    }
    const logoImg = document.getElementById("logoPreview");
    if (logoImg) setLogoImg(logoImg, me.logoKey);
    const { sub } = await getAuthState() || {};
    mediaKeys = Array.isArray(me.mediaKeys) ? me.mediaKeys.map((k) => normalizeS3Key(k, sub)) : [];
    highlights = Array.isArray(me.highlights) ? [...me.highlights] : [];
    renderPhotoGrid();
    renderHighlightList();
  } catch (e) {
    console.debug("loadMe:", e.message || e);
  }
}
async function init() {
  var _a, _b, _c;
  const state = await ensurePromoter();
  if (!state) return;
  const logoInput = document.getElementById("logo");
  const logoPreview = document.getElementById("logoPreview");
  logoInput == null ? void 0 : logoInput.addEventListener("change", () => {
    var _a2;
    const f = (_a2 = logoInput.files) == null ? void 0 : _a2[0];
    if (!f || !logoPreview) return;
    logoPreview.src = URL.createObjectURL(f);
  });
  (_a = document.getElementById("addPhotosBtn")) == null ? void 0 : _a.addEventListener("click", async () => {
    const input = document.getElementById("photoFiles");
    const files = Array.from((input == null ? void 0 : input.files) || []);
    if (!files.length) return;
    try {
      const { sub } = await getAuthState() || {};
      for (const f of files) {
        const key = await uploadToS3(f.name, f.type || "image/jpeg", f, {
          actor: "promoter",
          type: "gallery"
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
  (_b = document.getElementById("addHighlightUrlBtn")) == null ? void 0 : _b.addEventListener("click", () => {
    const el = document.getElementById("highlightUrl");
    const u = ((el == null ? void 0 : el.value) || "").trim();
    if (!u) return;
    highlights.push(u);
    renderHighlightList();
    el.value = "";
  });
  (_c = document.getElementById("uploadHighlightBtn")) == null ? void 0 : _c.addEventListener("click", async () => {
    var _a2;
    const input = document.getElementById("highlightFile");
    const f = (_a2 = input == null ? void 0 : input.files) == null ? void 0 : _a2[0];
    if (!f) return;
    try {
      const { sub } = await getAuthState() || {};
      const key = await uploadToS3(f.name, f.type || "video/mp4", f, {
        actor: "promoter",
        type: "highlight"
      });
      const val = typeof key === "string" && key.startsWith("public/") ? mediaUrl(key) : key;
      highlights.push(val);
      renderHighlightList();
      input.value = "";
    } catch (err) {
      console.error(err);
      toast("Video upload failed", "error");
    }
  });
  const form = document.getElementById("promoForm");
  const saveBtn = document.getElementById("saveBtn");
  form == null ? void 0 : form.addEventListener("submit", async (evt) => {
    evt.preventDefault();
    setDisabled(saveBtn, true);
    try {
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
        highlights
      };
      const socialKeys = [
        "twitter",
        "instagram",
        "facebook",
        "tiktok",
        "youtube",
        "website"
      ];
      const socials = {};
      for (const key of socialKeys) {
        const v = getVal(`social_${key}`);
        if (v) socials[key] = v;
      }
      if (Object.keys(socials).length) data.socials = socials;
      const logoKey = await uploadLogoIfAny();
      if (logoKey) data.logoKey = logoKey;
      data.mediaKeys = mediaKeys;
      data.highlights = highlights;
      const saved = await apiFetch("/profiles/promoters", {
        method: "PUT",
        body: data
      });
      toast("Promotion saved!");
      if ((saved == null ? void 0 : saved.logoKey) && logoPreview) {
        setLogoImg(logoPreview, saved.logoKey);
      }
    } catch (err) {
      console.error(err);
      toast((err == null ? void 0 : err.message) || "Save failed", "error");
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
