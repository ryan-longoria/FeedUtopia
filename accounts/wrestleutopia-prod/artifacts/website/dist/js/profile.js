import { u as uploadToS3, a as apiFetch, g as getAuthState, b as isWrestler, c as uploadAvatar } from "./chunks/core.js";
import { m as mediaUrl } from "./chunks/media.js";
import "https://esm.sh/aws-amplify@6";
import "https://esm.sh/aws-amplify@6/auth";
import "https://esm.sh/aws-amplify@6/utils";
const $ = (sel) => document.querySelector(sel);
const setVal = (id, v = "") => {
  const el = document.getElementById(id);
  if (el) el.value = v ?? "";
};
const setImg = (sel, key) => {
  const el = $(sel);
  if (!el) return;
  if (!key) {
    el.src = "/assets/avatar-fallback.svg";
    return;
  }
  const url = mediaUrl(String(key));
  const needsBust = /^public\/wrestlers\/profiles\//.test(String(key)) || /^profiles\//.test(String(key));
  el.src = needsBust ? `${url}?v=${Date.now()}` : url;
};
let mediaKeys = [];
let highlights = [];
(window.WU_MEDIA_BASE || "").replace(/\/+$/, "");
function renderPhotoGrid() {
  const wrap = document.getElementById("photoGrid");
  if (!wrap) return;
  wrap.innerHTML = (mediaKeys || []).map((k, i) => {
    const raw = typeof k === "string" && k.startsWith("raw/");
    const imgSrc = raw ? "/assets/image-processing.svg" : mediaUrl(k);
    return `
      <div class="media-card">
        <img src="${imgSrc}" alt="">
        <button class="btn secondary media-remove" type="button" data-i="${i}">Remove</button>
      </div>
    `;
  }).join("");
  wrap.querySelectorAll(".media-remove").forEach((btn) => {
    btn.onclick = () => {
      mediaKeys.splice(Number(btn.dataset.i), 1);
      renderPhotoGrid();
    };
  });
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
  ul.querySelectorAll("button").forEach((btn) => {
    btn.onclick = () => {
      highlights.splice(Number(btn.dataset.i), 1);
      renderHighlightList();
    };
  });
}
function photoUrlFromKey(key) {
  return key ? mediaUrl(String(key)) : "/assets/avatar-fallback.svg";
}
function toast(text, type = "success") {
  const t = $("#toast");
  if (!t) return console.log(text);
  t.textContent = text;
  t.classList.toggle("error", type === "error");
  t.style.display = "block";
  setTimeout(() => t.style.display = "none", 2400);
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
function formToObj(form) {
  const fd = new FormData(form);
  const o = {};
  for (const [k, v] of fd.entries()) o[k] = v;
  o.heightIn = Number(o.heightIn || NaN);
  o.weightLb = Number(o.weightLb || NaN);
  o.bio = (o.bio || "").trim() || null;
  o.gimmicks = (o.gimmicks || "").split(",").map((x) => x.trim()).filter(Boolean);
  o.socials = {
    twitter: (o.social_twitter || "").trim() || null,
    instagram: (o.social_instagram || "").trim() || null,
    tiktok: (o.social_tiktok || "").trim() || null,
    youtube: (o.social_youtube || "").trim() || null,
    website: (o.social_website || "").trim() || null
  };
  Object.keys(o.socials).forEach((k) => {
    if (!o.socials[k]) delete o.socials[k];
  });
  o.experienceYears = (o.experienceYears || "").toString().trim() === "" ? null : Number(o.experienceYears);
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
  var _a;
  const fileInput = document.getElementById("avatar");
  const file = (_a = fileInput == null ? void 0 : fileInput.files) == null ? void 0 : _a[0];
  if (!file) return null;
  return await uploadAvatar(file);
}
async function loadMe() {
  try {
    const me = await apiFetch("/profiles/wrestlers/me");
    if (!me || !me.userId) return;
    mediaKeys = Array.isArray(me.mediaKeys) ? [...me.mediaKeys] : [];
    highlights = Array.isArray(me.highlights) ? [...me.highlights] : [];
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
      achievements: "achievements"
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
      if (me[field] !== void 0 && me[field] !== null) setVal(id, me[field]);
    }
    if (Array.isArray(me.gimmicks) && me.gimmicks.length) {
      setVal("gimmicks", me.gimmicks.join(", "));
    }
    setImg(
      "#avatarPreview",
      me.photoKey || me.avatar_key || me.avatarKey || me.photo_key || null
    );
    const vb = document.getElementById("viewBtn");
    if (vb) {
      vb.disabled = !me.handle;
      if (me.handle) vb.dataset.handle = me.handle;
    }
  } catch (e) {
    console.debug("loadMe:", (e == null ? void 0 : e.message) || e);
  }
}
async function init() {
  var _a, _b, _c;
  const state = await ensureWrestler();
  if (!state) return;
  const form = document.getElementById("profileForm");
  const saveBtn = document.getElementById("saveBtn");
  const viewBtn = document.getElementById("viewBtn");
  const avatarInput = document.getElementById("avatar");
  const avatarPreview = document.getElementById("avatarPreview");
  avatarInput == null ? void 0 : avatarInput.addEventListener("change", () => {
    var _a2;
    const f = (_a2 = avatarInput.files) == null ? void 0 : _a2[0];
    if (f && avatarPreview) avatarPreview.src = URL.createObjectURL(f);
  });
  viewBtn == null ? void 0 : viewBtn.addEventListener("click", () => {
    var _a2, _b2, _c2, _d, _e, _f, _g, _h, _i, _j, _k, _l;
    const handle = (_a2 = viewBtn == null ? void 0 : viewBtn.dataset) == null ? void 0 : _a2.handle;
    if (handle) {
      location.href = `/w/#${encodeURIComponent(handle)}`;
      return;
    }
    const stageName = ((_b2 = $("#stageName")) == null ? void 0 : _b2.value) || "Wrestler";
    const first = ((_c2 = $("#firstName")) == null ? void 0 : _c2.value) || "";
    const middle = ((_d = $("#middleName")) == null ? void 0 : _d.value) || "";
    const last = ((_e = $("#lastName")) == null ? void 0 : _e.value) || "";
    const fullName = [first, middle, last].filter(Boolean).join(" ");
    const dob = ((_f = $("#dob")) == null ? void 0 : _f.value) || "";
    const city = ((_g = $("#city")) == null ? void 0 : _g.value) || "";
    const region = ((_h = $("#region")) == null ? void 0 : _h.value) || "";
    const country = ((_i = $("#country")) == null ? void 0 : _i.value) || "";
    const bio = ((_j = $("#bio")) == null ? void 0 : _j.value) || "";
    const gimmicks = (((_k = $("#gimmicks")) == null ? void 0 : _k.value) || "").split(",").map((s) => s.trim()).filter(Boolean);
    const imgSrc = (avatarPreview == null ? void 0 : avatarPreview.src) || "/assets/avatar-fallback.svg";
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
    (_l = document.getElementById("preview-modal")) == null ? void 0 : _l.showModal();
  });
  (_a = document.getElementById("addPhotosBtn")) == null ? void 0 : _a.addEventListener("click", async () => {
    const input = document.getElementById("photoFiles");
    const files = Array.from((input == null ? void 0 : input.files) || []);
    if (!files.length) return;
    for (const f of files) {
      const key = await uploadToS3(f.name, f.type || "image/jpeg", f, {
        actor: "wrestler",
        type: "gallery"
      });
      mediaKeys.push(key);
    }
    renderPhotoGrid();
    input.value = "";
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
    const key = await uploadToS3(f.name, f.type || "video/mp4", f, {
      actor: "wrestler",
      type: "highlight"
    });
    const val = typeof key === "string" && key.startsWith("public/") ? mediaUrl(key) : key;
    highlights.push(val);
    renderHighlightList();
    input.value = "";
  });
  form == null ? void 0 : form.addEventListener("submit", async (e) => {
    e.preventDefault();
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
        // required
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
        // optional
        bio: data.bio,
        gimmicks: data.gimmicks,
        socials: data.socials,
        experienceYears: data.experienceYears,
        achievements: data.achievements,
        // media
        photoKey: data.photoKey || null,
        avatarKey: data.avatarKey || null,
        photo_key: data.photo_key || null,
        avatar_key: data.avatar_key || null,
        mediaKeys,
        highlights
      };
      const saved = await apiFetch("/profiles/wrestlers/me", {
        method: "PUT",
        body: payload
      });
      toast("Profile saved!");
      if ((saved == null ? void 0 : saved.handle) && viewBtn) {
        viewBtn.disabled = false;
        viewBtn.dataset.handle = saved.handle;
        viewBtn.onclick = () => {
          location.href = `/w/#${encodeURIComponent(saved.handle)}`;
        };
      }
      const newKey = (saved == null ? void 0 : saved.photoKey) || (saved == null ? void 0 : saved.avatarKey) || (saved == null ? void 0 : saved.avatar_key) || (saved == null ? void 0 : saved.photo_key) || data.photoKey || data.avatarKey || data.avatar_key || data.photo_key;
      if (newKey && avatarPreview) {
        avatarPreview.src = photoUrlFromKey(newKey);
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
const run = () => {
  const dlg = document.getElementById("preview-modal");
  const closeBtn = document.getElementById("preview-close");
  if (dlg && closeBtn) {
    closeBtn.addEventListener("click", () => dlg.close());
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run, { once: true });
} else {
  run();
}
