import { Amplify } from "https://esm.sh/aws-amplify@6";
import { fetchAuthSession } from "https://esm.sh/aws-amplify@6/auth";
import { Hub } from "https://esm.sh/aws-amplify@6/utils";
(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
window.WU_API = "https://go2gft4394.execute-api.us-east-2.amazonaws.com";
window.WU_MEDIA_BASE = "https://d178p8k1vmj1zs.cloudfront.net";
Amplify.configure({
  Auth: {
    Cognito: {
      region: "us-east-2",
      userPoolId: "us-east-2_9oCzdeOZF",
      userPoolClientId: "6f4qoincbfm9g0lifod7q8nuhg",
      loginWith: { username: false, email: true, phone: false },
      signUpVerificationMethod: "code"
    }
  }
});
const AUTH_EVENT = "auth:changed";
function emitAuthChanged(detail = {}) {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail }));
}
Hub.listen("auth", ({ payload }) => {
  const { event } = payload || {};
  if (["signedIn", "signedOut", "tokenRefresh"].includes(event)) {
    emitAuthChanged({ event });
  }
});
(async () => {
  try {
    const session = await fetchAuthSession();
    if (session) {
      emitAuthChanged({ event: "initial" });
    }
  } catch {
    emitAuthChanged({ event: "initial" });
  }
})();
const authBridge = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  fetchAuthSession
}, Symbol.toStringTag, { value: "Module" }));
function joinUrl(base, path) {
  if (!base) throw new Error("WU_API base URL missing");
  if (!path) return base;
  return base.replace(/\/+$/, "") + "/" + String(path).replace(/^\/+/, "");
}
async function authToken() {
  var _a, _b, _c, _d;
  const s = await fetchAuthSession();
  return ((_b = (_a = s == null ? void 0 : s.tokens) == null ? void 0 : _a.idToken) == null ? void 0 : _b.toString()) || ((_d = (_c = s == null ? void 0 : s.tokens) == null ? void 0 : _c.accessToken) == null ? void 0 : _d.toString()) || "";
}
async function md5Base64(blob) {
  if (!window.SparkMD5) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/spark-md5@3.0.2/spark-md5.min.js";
      s.onload = res;
      s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const chunkSize = 2 * 1024 * 1024;
  const chunks = Math.ceil(blob.size / chunkSize);
  const spark = new window.SparkMD5.ArrayBuffer();
  for (let i = 0; i < chunks; i++) {
    const buf = await blob.slice(i * chunkSize, Math.min((i + 1) * chunkSize, blob.size)).arrayBuffer();
    spark.append(buf);
  }
  const hex = spark.end();
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
async function apiFetch(path, { method = "GET", body = null, headers: extraHeaders = {} } = {}) {
  const token = await authToken();
  const headers = { ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body != null) headers["content-type"] = "application/json";
  const hasBody = body !== null && body !== void 0;
  const res = await fetch(joinUrl(window.WU_API, path), {
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : null
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const t = await res.text();
      if (t) {
        try {
          msg = JSON.parse(t).message || t;
        } catch {
          msg = t;
        }
      }
    } catch {
    }
    throw new Error(`API ${res.status}: ${msg}`);
  }
  if (res.status === 204 || res.status === 205 || res.status === 304)
    return null;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    const txt = await res.text().catch(() => "");
    return txt || null;
  }
  return res.json();
}
async function uploadAvatar(file) {
  const md5b64 = await md5Base64(file);
  const presign = await apiFetch(
    `/profiles/wrestlers/me/photo-url?contentType=${encodeURIComponent(file.type || "application/octet-stream")}`,
    { method: "POST", headers: { "Content-MD5": md5b64 } }
  );
  const uploadUrl = presign == null ? void 0 : presign.uploadUrl;
  const objectKey = presign == null ? void 0 : presign.objectKey;
  const contentType = (presign == null ? void 0 : presign.contentType) || file.type || "application/octet-stream";
  if (!uploadUrl || !objectKey) throw new Error("presign failed");
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-server-side-encryption": "AES256",
      "Content-MD5": md5b64
    },
    body: file
  });
  if (!putRes.ok) {
    throw new Error(
      `S3 upload failed ${putRes.status}: ${await putRes.text().catch(() => putRes.statusText)}`
    );
  }
  return objectKey;
}
async function uploadToS3(filename, contentType, file, opts = {}) {
  const md5b64 = await md5Base64(file);
  const params = new URLSearchParams({
    key: filename || "upload.bin",
    contentType: contentType || "application/octet-stream"
  });
  if (opts.actor) params.set("actor", String(opts.actor));
  if (opts.type) params.set("type", String(opts.type));
  const presign = await apiFetch(`/s3/presign?${params.toString()}`, {
    method: "GET",
    headers: { "Content-MD5": md5b64 }
  });
  const uploadUrl = (presign == null ? void 0 : presign.uploadUrl) || (presign == null ? void 0 : presign.url) || (presign == null ? void 0 : presign.signedUrl);
  const objectKey = (presign == null ? void 0 : presign.objectKey) || (presign == null ? void 0 : presign.key);
  const signedCT = (presign == null ? void 0 : presign.contentType) || contentType || "application/octet-stream";
  if (!uploadUrl || !objectKey) {
    console.error("presign response:", presign);
    throw new Error(
      "Failed to get presigned URL (missing uploadUrl/objectKey)"
    );
  }
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": signedCT,
      "x-amz-server-side-encryption": "AES256",
      "Content-MD5": md5b64
    },
    body: file
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => "");
    throw new Error(
      `S3 upload failed ${putRes.status}: ${text || putRes.statusText}`
    );
  }
  return objectKey;
}
function asItems(x) {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.items)) return x.items;
  return [];
}
window.WU_API_READY = true;
const scriptRel = "modulepreload";
const assetsURL = function(dep) {
  return "/" + dep;
};
const seen = {};
const __vitePreload = function preload(baseModule, deps, importerUrl) {
  let promise = Promise.resolve();
  if (deps && deps.length > 0) {
    document.getElementsByTagName("link");
    const cspNonceMeta = document.querySelector(
      "meta[property=csp-nonce]"
    );
    const cspNonce = (cspNonceMeta == null ? void 0 : cspNonceMeta.nonce) || (cspNonceMeta == null ? void 0 : cspNonceMeta.getAttribute("nonce"));
    promise = Promise.allSettled(
      deps.map((dep) => {
        dep = assetsURL(dep);
        if (dep in seen) return;
        seen[dep] = true;
        const isCss = dep.endsWith(".css");
        const cssSelector = isCss ? '[rel="stylesheet"]' : "";
        if (document.querySelector(`link[href="${dep}"]${cssSelector}`)) {
          return;
        }
        const link = document.createElement("link");
        link.rel = isCss ? "stylesheet" : scriptRel;
        if (!isCss) {
          link.as = "script";
        }
        link.crossOrigin = "";
        link.href = dep;
        if (cspNonce) {
          link.setAttribute("nonce", cspNonce);
        }
        document.head.appendChild(link);
        if (isCss) {
          return new Promise((res, rej) => {
            link.addEventListener("load", res);
            link.addEventListener(
              "error",
              () => rej(new Error(`Unable to preload CSS for ${dep}`))
            );
          });
        }
      })
    );
  }
  function handlePreloadError(err) {
    const e = new Event("vite:preloadError", {
      cancelable: true
    });
    e.payload = err;
    window.dispatchEvent(e);
    if (!e.defaultPrevented) {
      throw err;
    }
  }
  return promise.then((res) => {
    for (const item of res || []) {
      if (item.status !== "rejected") continue;
      handlePreloadError(item.reason);
    }
    return baseModule().catch(handlePreloadError);
  });
};
async function getAuthState() {
  var _a, _b;
  try {
    const s = await fetchAuthSession();
    const id = (_b = (_a = s == null ? void 0 : s.tokens) == null ? void 0 : _a.idToken) == null ? void 0 : _b.toString();
    if (!id) return { signedIn: false, groups: [], role: null, sub: null };
    const payload = JSON.parse(atob(id.split(".")[1]));
    const groups = Array.isArray(payload["cognito:groups"]) ? payload["cognito:groups"] : payload["cognito:groups"] ? String(payload["cognito:groups"]).split(/[,\s]+/) : [];
    const roleClaim = (payload["custom:role"] || "").toLowerCase();
    const role = roleClaim.startsWith("promo") ? "Promoter" : roleClaim.startsWith("wrestl") ? "Wrestler" : null;
    const sub = payload["sub"] || null;
    return { signedIn: true, groups, role, sub };
  } catch {
    return { signedIn: false, groups: [], role: null, sub: null };
  }
}
const isPromoter = (s) => {
  var _a;
  return ((_a = s.groups) == null ? void 0 : _a.includes("Promoters")) || s.role === "Promoter";
};
const isWrestler = (s) => {
  var _a;
  return ((_a = s.groups) == null ? void 0 : _a.includes("Wrestlers")) || s.role === "Wrestler";
};
async function applyRoleGatedUI() {
  const s = await getAuthState();
  document.body.dataset.role = s.role || "";
  document.body.dataset.signedin = s.signedIn ? "true" : "false";
  document.querySelectorAll('[data-auth="in"]').forEach((el) => el.style.display = s.signedIn ? "" : "none");
  document.querySelectorAll('[data-auth="out"]').forEach((el) => el.style.display = s.signedIn ? "none" : "");
  const showForPromoter = isPromoter(s);
  const showForWrestler = isWrestler(s);
  document.querySelectorAll('[data-requires="promoter"]').forEach((el) => el.style.display = showForPromoter ? "" : "none");
  document.querySelectorAll('[data-requires="wrestler"]').forEach((el) => el.style.display = showForWrestler ? "" : "none");
  return s;
}
(async () => {
  const s = await getAuthState();
  if (isPromoter(s) || isWrestler(s)) {
    document.body.classList.add("authenticated");
  }
})();
const roles = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  applyRoleGatedUI,
  getAuthState,
  isPromoter,
  isWrestler
}, Symbol.toStringTag, { value: "Module" }));
function serializeForm(form) {
  const data = new FormData(form);
  const obj = {};
  for (const [k, v] of data.entries()) {
    if (obj[k]) {
      if (Array.isArray(obj[k])) obj[k].push(v);
      else obj[k] = [obj[k], v];
    } else {
      obj[k] = v;
    }
  }
  return obj;
}
function toast(text, type = "success") {
  const t = document.querySelector("#toast");
  if (!t) {
    if (type === "error") console.error(text);
    else console.log(text);
    return;
  }
  t.textContent = text;
  t.classList.toggle("error", type === "error");
  t.style.display = "block";
  setTimeout(() => t.style.display = "none", 2600);
}
window.toast = toast;
function renderTalent(list) {
  const target = document.querySelector("#talent-list");
  if (!target) return;
  const items = Array.isArray(list) ? list : list ? [list] : [];
  target.innerHTML = "";
  const fallback = (ring) => `https://picsum.photos/seed/${encodeURIComponent(ring)}/200/200`;
  items.forEach((p, idx) => {
    var _a;
    const ring = p.ring || p.ringName || p.stageName || p.name || "Wrestler";
    const name = p.name || "";
    const yrs = p.years ?? p.yearsExperience ?? 0;
    const styles = Array.isArray(p.styles) ? p.styles : Array.isArray(p.gimmicks) ? p.gimmicks : [];
    const city = [p.city, p.region, p.country].filter(Boolean).join(", ");
    const rateMin = p.rate_min ?? p.rateMin ?? 0;
    const rateMax = p.rate_max ?? p.rateMax ?? 0;
    const verified = !!p.verified_school || !!p.verifiedSchool;
    const reel = p.reel || p.reelLink || "#";
    const avatar = (p.photoKey && window.WU_MEDIA_BASE ? `${window.WU_MEDIA_BASE}/${p.photoKey}` : p.avatar) || fallback(ring);
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `<div class="profile">
      <img src="${avatar}" alt="${ring} profile"/>
      <div class="info">
        <div><strong>${ring}</strong> <span class="muted">(${name})</span></div>
        <div class="mt-2">${city || "—"} • ${yrs} yrs • ${styles.join(", ")}</div>
        <div class="mt-2">${verified ? '<span class="badge">Verified school</span>' : ""}</div>
        <div class="mt-2 muted">Rate: $${rateMin}-${rateMax}</div>
        <div class="mt-3" style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn small view-profile-btn" type="button">View Profile</button>
          ${p.handle ? `<a class="btn small secondary" href="/w/#${encodeURIComponent(p.handle)}">See Full Profile</a>` : ""}
        </div>
      </div>
    </div>`;
    (_a = el.querySelector(".view-profile-btn")) == null ? void 0 : _a.addEventListener("click", () => {
      var _a2;
      const html = `
        <div style="display:grid;grid-template-columns:120px 1fr;gap:16px">
          <img src="${avatar}" alt="Avatar" style="width:120px;height:120px;border-radius:999px;object-fit:cover;background:#0f1224;border:1px solid #1f2546"/>
          <div>
            <h2 style="margin:0">${ring}</h2>
            <div class="muted">${city || ""}</div>
            <div class="chips mt-2">${styles.map((g) => `<span class="chip">${g}</span>`).join("")}</div>
          </div>
        </div>
        <div class="mt-3">
          ${p.bio ? `<p>${String(p.bio).replace(/\n/g, "<br/>")}</p>` : '<p class="muted">No bio yet.</p>'}
        </div>
        <dl class="mt-3">
          <dt class="muted">Name</dt><dd>${name}</dd>
          ${p.dob ? `<dt class="muted mt-2">DOB</dt><dd>${p.dob}</dd>` : ""}
          ${verified ? `<dt class="muted mt-2">School</dt><dd>Verified</dd>` : ""}
        </dl>
        ${reel !== "#" ? `<div class="mt-3"><a class="btn small secondary" href="${reel}" target="_blank" rel="noopener">Watch Reel</a></div>` : ""}
      `;
      const box = document.getElementById("wm-content");
      if (box) box.innerHTML = html;
      (_a2 = document.getElementById("wrestler-modal")) == null ? void 0 : _a2.showModal();
    });
    target.appendChild(el);
  });
}
function renderTryouts(list) {
  const target = document.querySelector("#tryout-list");
  if (!target) return;
  target.innerHTML = "";
  const items = Array.isArray(list) ? list : list ? [list] : [];
  if (items.length === 0) {
    target.innerHTML = '<p class="muted">No open tryouts yet.</p>';
    return;
  }
  items.forEach((t) => {
    const id = t.tryoutId || t.id;
    const org = t.orgName || t.org || "";
    const ownerId = t.ownerId || "";
    const city = t.city || "";
    const dateStr = t.date ? new Date(t.date).toLocaleDateString() : "";
    const reqs = t.requirements || "";
    const slots = t.slots ?? 0;
    const status = (t.status || "open").toUpperCase();
    const el = document.createElement("div");
    el.className = "card";
    el.dataset.tryoutId = id;
    el.innerHTML = `<div class="badge">${status}</div>
      <h3 style="margin:6px 0 2px">
        ${ownerId ? `<a href="/p/#${encodeURIComponent(ownerId)}">${org}</a>` : org}
      </h3>
      <div class="muted">${city} • ${dateStr}</div>
      <p class="mt-3">${reqs}</p>
      <div class="mt-3">
        <button class="btn small apply-btn" data-id="${id}" data-org="${org}">Apply</button>
        <span class="muted" style="margin-left:10px">Slots: ${slots}</span>
      </div>`;
    target.appendChild(el);
  });
  getAuthState().then((s) => {
    const allow = isWrestler(s);
    document.querySelectorAll(".apply-btn").forEach((btn) => {
      if (!allow) {
        btn.textContent = "Log in as Wrestler to apply";
        btn.addEventListener(
          "click",
          (e) => {
            var _a;
            e.preventDefault();
            (_a = document.querySelector("#login-btn")) == null ? void 0 : _a.click();
          },
          { once: true }
        );
      } else {
        btn.addEventListener("click", (e) => {
          const b = e.currentTarget;
          window.openApply(b.dataset.id, b.dataset.org);
        });
      }
    });
  });
}
function renderApps(list) {
  const target = document.querySelector("#app-list");
  if (!target) return;
  target.innerHTML = "";
  (list || []).forEach((a) => {
    const reel = a.reelLink || a.reel || "#";
    const when = a.timestamp || a.created_at || a.createdAt || (/* @__PURE__ */ new Date()).toISOString();
    const notes = a.notes || "";
    const who = a.applicantId ? `Applicant: ${a.applicantId}` : "";
    const el = document.createElement("div");
    el.className = "card";
    el.innerHTML = `<div><strong>${who}</strong></div>
      <div class="mt-2"><a href="${reel}" target="_blank" rel="noopener">Reel</a> • <span class="muted">${new Date(when).toLocaleString()}</span></div>
      <div class="mt-2">${notes}</div>`;
    target.appendChild(el);
  });
}
function openApply(id, org) {
  const f = document.querySelector("#apply-form");
  if (!f) return;
  f.tryout_id.value = id;
  const title = document.querySelector("#apply-title");
  if (title) title.textContent = "Apply to " + org;
  const modal = document.querySelector("#apply-modal");
  if (modal) modal.showModal();
}
window.openApply = openApply;
async function renderTalentSearchPanel() {
  var _a;
  const searchForm = document.querySelector("#talent-search");
  const resultsWrap = ((_a = document.querySelector("#talent-list")) == null ? void 0 : _a.closest("section, .card, .panel")) || document.querySelector("#talent-list");
  if (!searchForm) return;
  const s = await getAuthState();
  if (!isPromoter(s)) {
    if (resultsWrap) {
      resultsWrap.innerHTML = `
        <div class="card">
          <h2>Talent Search <span class="badge">Locked</span></h2>
          <p class="muted">Only promoters can search wrestler profiles. 
          <a href="#" data-auth="out" id="become-promoter">Create a free promoter account</a>.</p>
        </div>`;
    } else {
      (searchForm.closest("section, .card, .panel") || searchForm).style.display = "none";
    }
    return;
  }
  const onFilter = async () => {
    try {
      const o = serializeForm(searchForm);
      const qs = new URLSearchParams();
      if (o.style && o.style !== "any") qs.set("style", o.style);
      if (o.city) qs.set("city", o.city);
      if (o.verified === "true") qs.set("verified", "true");
      if (o.q) qs.set("q", o.q);
      const path = `/profiles/wrestlers${qs.toString() ? "?" + qs.toString() : ""}`;
      const list = await apiFetch(path);
      renderTalent(list);
    } catch (err) {
      console.error(err);
      toast("You must be a promoter to view talent profiles.", "error");
      renderTalent([]);
    }
  };
  ["input", "change"].forEach(
    (evt) => searchForm.addEventListener(evt, onFilter)
  );
  onFilter();
}
async function renderTryoutsListPanel() {
  const listEl = document.querySelector("#tryout-list");
  if (!listEl) return;
  try {
    const resp = await apiFetch("/tryouts");
    const list = asItems(resp);
    renderTryouts(list);
    if (location.hash) {
      const id = location.hash.substring(1);
      const el = document.querySelector(`[data-tryout-id="${id}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }
  } catch (err) {
    if (String(err).includes("API 401")) {
      listEl.innerHTML = '<p class="muted">Please sign in to view tryouts.</p>';
      return;
    }
    console.error(err);
    listEl.innerHTML = '<p class="muted">Could not load tryouts.</p>';
  }
}
async function renderAppsPanel() {
  const apps = document.querySelector("#app-list");
  if (!apps) return;
  try {
    const url = new URL(location.href);
    const tId = url.searchParams.get("tryout");
    const path = tId ? `/applications?tryoutId=${encodeURIComponent(tId)}` : "/applications";
    const list = await apiFetch(path);
    renderApps(list);
  } catch (err) {
    console.error(err);
    renderApps([]);
  }
}
async function wireForms() {
  const talentForm = document.querySelector("#talent-form");
  if (talentForm) {
    talentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const o = serializeForm(talentForm);
        const styles = (Array.isArray(o.styles) ? o.styles : [o.styles]).filter(
          Boolean
        );
        const body = {
          name: o.name,
          ring: o.ring,
          city: o.city,
          travel: Number(o.travel || 0),
          height_cm: Number(o.height_cm || 0),
          weight_kg: Number(o.weight_kg || 0),
          years: Number(o.years || 0),
          school: o.school || "",
          styles,
          reel: o.reel || "",
          rate_min: Number(o.rate_min || 0),
          rate_max: Number(o.rate_max || 0),
          verified_school: false
        };
        await apiFetch("/profiles/wrestlers", { method: "POST", body });
        toast("Talent profile saved!");
        talentForm.reset();
      } catch (err) {
        console.error(err);
        toast("Could not save profile", "error");
      }
    });
  }
  const tryoutForm = document.querySelector("#tryout-form");
  if (tryoutForm) {
    tryoutForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const o = serializeForm(tryoutForm);
        const body = {
          orgName: o.org || "",
          city: o.city || "",
          date: o.date || "",
          slots: Number(o.slots || 0),
          requirements: o.requirements || "",
          contact: o.contact || "",
          status: "open"
        };
        await apiFetch("/tryouts", { method: "POST", body });
        toast("Tryout posted!");
        tryoutForm.reset();
        await renderTryoutsListPanel();
      } catch (err) {
        console.error(err);
        toast("Could not post tryout", "error");
      }
    });
  }
  const appForm = document.querySelector("#apply-form");
  if (appForm) {
    appForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        const o = serializeForm(appForm);
        const body = {
          tryoutId: o.tryout_id,
          notes: o.notes || "",
          reelLink: o.reel || ""
        };
        await apiFetch("/applications", { method: "POST", body });
        toast("Application sent!");
        appForm.reset();
        const modal = document.querySelector("#apply-modal");
        if (modal) modal.close();
        await renderAppsPanel();
      } catch (err) {
        console.error(err);
        toast("Could not submit application", "error");
      }
    });
  }
  await Promise.all([
    renderTalentSearchPanel(),
    renderTryoutsListPanel(),
    renderAppsPanel()
  ]);
}
document.addEventListener("DOMContentLoaded", wireForms);
window.addEventListener("auth:changed", wireForms);
(async function() {
  async function fetchHTML(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return await res.text();
  }
  function executeScripts(container) {
    const scripts = container.querySelectorAll("script");
    scripts.forEach((old) => {
      const s = document.createElement("script");
      for (const { name, value } of old.attributes) s.setAttribute(name, value);
      s.text = old.text;
      old.parentNode.replaceChild(s, old);
    });
  }
  async function injectPartialsRecursive(root = document) {
    let pass = 0;
    while (true) {
      const nodes = root.querySelectorAll("[data-include]");
      if (nodes.length === 0) break;
      pass++;
      await Promise.all(
        Array.from(nodes).map(async (el) => {
          const url = el.getAttribute("data-include");
          try {
            const html = await fetchHTML(url);
            const wrapper = document.createElement("div");
            wrapper.innerHTML = html;
            el.replaceWith(...Array.from(wrapper.childNodes));
            executeScripts(document);
          } catch (e) {
            console.error("Include failed for", url, e);
          }
        })
      );
      if (pass > 10) {
        console.warn(
          "include.js: stopping after 10 recursive passes to avoid loops"
        );
        break;
      }
    }
  }
  await injectPartialsRecursive();
  window.dispatchEvent(new Event("partials:ready"));
  try {
    const { applyRoleGatedUI: applyRoleGatedUI2 } = await __vitePreload(async () => {
      const { applyRoleGatedUI: applyRoleGatedUI3 } = await Promise.resolve().then(() => roles);
      return { applyRoleGatedUI: applyRoleGatedUI3 };
    }, true ? void 0 : void 0);
    await applyRoleGatedUI2();
  } catch (e) {
    console.error("roles.js load/apply failed", e);
  }
  (function highlightNav() {
    const path = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".wu-links a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const targetPath = href.split("#")[0];
      if (targetPath === path) a.classList.add("active");
    });
  })();
  const btn = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");
  if (btn && links) {
    btn.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  const y = document.getElementById("year");
  if (y) y.textContent = (/* @__PURE__ */ new Date()).getFullYear();
})();
function toHashUrl(kind, slug) {
  if (!slug) return "#";
  return `/${kind}/#${encodeURIComponent(slug)}`;
}
async function resolveMyProfileUrl() {
  const state = await getAuthState();
  if (!state) return "#";
  if (isWrestler(state)) {
    try {
      const me = await apiFetch("/profiles/wrestlers/me");
      if (me == null ? void 0 : me.handle) return toHashUrl("w", me.handle);
    } catch {
    }
    return "/dashboard_wrestler.html";
  }
  if (isPromoter(state)) {
    try {
      const me = await apiFetch("/profiles/promoters/me");
      const id = (me == null ? void 0 : me.handle) || (me == null ? void 0 : me.id) || (me == null ? void 0 : me.sub) || state.sub;
      if (id) return toHashUrl("p", id);
    } catch {
    }
    if (state.sub) return toHashUrl("p", state.sub);
    return "/dashboard_promoter.html";
  }
  return "#";
}
function getAllMyProfileLinks() {
  return Array.from(
    document.querySelectorAll("#nav-my-profile, #my-profile-link, [data-myprofile]")
  );
}
async function upgradeMyProfileLinks() {
  const links = getAllMyProfileLinks();
  if (!links.length) return;
  const url = await resolveMyProfileUrl();
  if (!url || url === "#") return;
  links.forEach((a) => {
    a.setAttribute("href", url);
    const handler = (e) => {
      if (url.startsWith("/w/#") || url.startsWith("/p/#")) {
        e.preventDefault();
        location.href = url;
      }
    };
    a.removeEventListener("click", a.__myprofileHandler);
    a.addEventListener("click", handler);
    a.__myprofileHandler = handler;
  });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", upgradeMyProfileLinks, { once: true });
} else {
  upgradeMyProfileLinks();
}
window.addEventListener("auth:changed", upgradeMyProfileLinks);
try {
  const cached = window.WU_USER || JSON.parse(localStorage.getItem("wuUser") || "null");
  if (cached == null ? void 0 : cached.handle) {
    const optimistic = cached.role === "promoter" ? toHashUrl("p", cached.handle) : toHashUrl("w", cached.handle);
    getAllMyProfileLinks().forEach((a) => a.setAttribute("href", optimistic));
  }
} catch {
}
export {
  __vitePreload as _,
  apiFetch as a,
  isWrestler as b,
  uploadAvatar as c,
  asItems as d,
  authBridge as e,
  getAuthState as g,
  isPromoter as i,
  md5Base64 as m,
  uploadToS3 as u
};
