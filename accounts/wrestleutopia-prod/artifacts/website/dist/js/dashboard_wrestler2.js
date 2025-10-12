var _a, _b;
import { apiFetch, asItems } from "./api.js";
import { getAuthState, isWrestler } from "./roles.js";
import "./auth-bridge.js";
import "https://esm.sh/aws-amplify@6";
import "https://esm.sh/aws-amplify@6/auth";
import "https://esm.sh/aws-amplify@6/utils";
const PAGE_CORR_ID = (((_b = (_a = globalThis.crypto) == null ? void 0 : _a.randomUUID) == null ? void 0 : _b.call(_a)) || `${Date.now()}-${Math.random()}`).toString();
function sendMetric(evt, data = {}) {
  try {
    const payload = JSON.stringify({
      evt,
      t: Date.now(),
      corr: PAGE_CORR_ID,
      ...data
    });
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/rum/dashboard", blob);
    } else {
      fetch("/rum/dashboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload }).catch(() => {
      });
    }
  } catch {
  }
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function robustFetch(path, {
  method = "GET",
  body,
  headers = {},
  timeoutMs = 8e3,
  retries = 2
} = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("client-timeout")), timeoutMs);
  try {
    const res = await apiFetch(path, {
      method,
      body,
      headers: { "x-corr-id": PAGE_CORR_ID, ...headers },
      signal: ac.signal
    });
    return res;
  } catch (err) {
    const msg = String(err || "");
    const retryable = /client-timeout|5\d\d|NetworkError|fetch failed|TypeError: Failed to fetch/i.test(msg);
    if (retries > 0 && retryable) {
      const backoff = Math.floor(300 + Math.random() * 500) * (3 - retries);
      await sleep(backoff);
      return robustFetch(path, { method, body, headers, timeoutMs, retries: retries - 1 });
    }
    try {
      console.error(JSON.stringify({ evt: "dash_api_error", corr: PAGE_CORR_ID, path, msg }));
    } catch {
      console.error("dash_api_error", PAGE_CORR_ID, path, msg);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
const CACHE_NS = "dash_wrestler_v1";
function cacheKey(path, extra = "") {
  return `${CACHE_NS}:${path}:${extra}`;
}
function getCachedJson(key, maxAgeMs) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.t !== "number" || Date.now() - obj.t > maxAgeMs) return null;
    return obj.v;
  } catch {
    return null;
  }
}
function setCachedJson(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
  }
}
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "className") node.className = v;
    else if (k === "text") node.textContent = String(v);
    else node.setAttribute(k, String(v));
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}
function safeLink(href, text) {
  return el("a", { href, target: "_blank", rel: "noopener noreferrer", text });
}
function clearNode(n) {
  while (n.firstChild) n.removeChild(n.firstChild);
}
const fmtDate = (iso) => {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso || "";
  }
};
const daysUntil = (iso) => {
  const d = new Date(iso);
  const now = /* @__PURE__ */ new Date();
  if (isNaN(d)) return 9999;
  return Math.ceil((d - now) / (1e3 * 60 * 60 * 24));
};
async function getMyWrestlerProfile() {
  try {
    try {
      const me = await robustFetch("/profiles/wrestlers/me");
      if (me) return me;
    } catch {
    }
    try {
      const list = await robustFetch("/profiles/wrestlers?me=true");
      if (Array.isArray(list) && list.length) return list[0];
    } catch {
    }
  } catch {
  }
  return null;
}
function renderTryoutCard(t) {
  const id = String(t.tryoutId ?? t.id ?? "");
  const org = String(t.orgName ?? t.org ?? "Promotion");
  const ownerId = String(t.ownerId ?? "");
  const city = String(t.city ?? "—");
  const date = fmtDate(t.date);
  const reqs = String(t.requirements ?? "Basic bumps, cardio, promo.");
  const status = String(t.status ?? "open").toUpperCase();
  const card = el("div", { className: "card" }, [
    el("div", { className: "badge", text: status }),
    el("h3", { className: "mt-1" }, [
      ownerId ? el("a", { href: `/p/#${encodeURIComponent(ownerId)}`, text: org }) : el("span", { text: org })
    ]),
    el("div", { className: "muted", text: `${city} • ${date}` }),
    el("p", { className: "mt-3", text: reqs })
  ]);
  const cta = el("div", { className: "mt-3" }, [
    el("a", {
      className: "btn small",
      href: `tryouts.html#${encodeURIComponent(id)}`,
      "data-requires": "wrestler",
      text: "Apply",
      "aria-label": `Apply to ${org}`
    })
  ]);
  if (typeof t.slots === "number") {
    cta.appendChild(el("span", { className: "muted ml-10", text: `Slots: ${t.slots}` }));
  }
  card.appendChild(cta);
  return card;
}
function renderEmptyTryouts(target, opts = {}) {
  clearNode(target);
  const card = el("div", { className: "card" }, [
    el("h3", { text: opts.title || "No recommended tryouts yet" }),
    el("p", { className: "muted", text: opts.desc || "We couldn’t find any upcoming open tryouts right now. Check back soon or browse all tryouts." }),
    el("div", { className: "mt-3" }, [
      el("a", { className: "btn small secondary", href: "tryouts.html", text: "Browse all tryouts" })
    ])
  ]);
  target.appendChild(card);
}
function scoreTryout(t, profile) {
  const d = daysUntil(t.date);
  let score = Math.max(0, 60 - Math.min(60, d));
  if (profile) {
    const cityMatch = profile.city && t.city && String(profile.city).toLowerCase() === String(t.city).toLowerCase();
    if (cityMatch) score += 20;
    const styles = Array.isArray(profile.styles) ? profile.styles.map((s) => String(s).toLowerCase()) : [];
    if (styles.length) {
      const text = [t.requirements, t.title, t.orgName, t.org].filter(Boolean).join(" ").toLowerCase();
      const overlaps = styles.filter((s) => text.includes(s)).length;
      score += Math.min(20, overlaps * 7);
    }
  }
  return score;
}
async function loadRecommendedTryouts() {
  const target = document.getElementById("dash-tryouts");
  if (!target) return;
  clearNode(target);
  target.appendChild(
    el("div", { className: "card" }, [
      el("h3", { text: "Loading recommended tryouts…" }),
      el("p", { className: "muted", text: "Fetching the latest openings for you." })
    ])
  );
  try {
    const s = await getAuthState().catch(() => null);
    if (!isWrestler(s)) {
      renderEmptyTryouts(target);
      return;
    }
    const cacheK = cacheKey("/tryouts", (s == null ? void 0 : s.sub) || "anon");
    const cached = getCachedJson(cacheK, 90 * 1e3);
    let profile, list;
    const start = performance.now();
    if (cached) {
      [profile, list] = await Promise.all([
        getMyWrestlerProfile(),
        Promise.resolve(cached)
      ]);
    } else {
      try {
        [profile, list] = await Promise.all([
          getMyWrestlerProfile(),
          robustFetch("/tryouts")
        ]);
        setCachedJson(cacheK, list);
      } catch (e) {
        const msg = String(e);
        if (msg.includes("API 401")) {
          clearNode(target);
          target.appendChild(
            el("div", { className: "card" }, [
              el("p", { className: "muted", text: "Please sign in to view recommended tryouts." })
            ])
          );
          return;
        }
        throw e;
      }
    }
    const now = /* @__PURE__ */ new Date();
    const upcomingOpen = asItems(list).filter((t) => {
      const d = new Date(t.date);
      return (t.status || "open") === "open" && !isNaN(d) && d >= now;
    });
    if (!upcomingOpen.length) {
      renderEmptyTryouts(target);
      sendMetric("dash_tryouts_empty", { dur: Math.round(performance.now() - start) });
      return;
    }
    const ranked = upcomingOpen.map((t) => ({ t, score: scoreTryout(t, profile) })).sort((a, b) => b.score - a.score).slice(0, 6).map((x) => x.t);
    clearNode(target);
    for (const t of ranked) target.appendChild(renderTryoutCard(t));
    sendMetric("dash_tryouts_ok", {
      dur: Math.round(performance.now() - start),
      count: ranked.length
    });
  } catch (e) {
    const msg = String(e || "");
    console.error("dash recommended tryouts error", { corr: PAGE_CORR_ID, msg });
    const transient = /client-timeout|5\d\d|NetworkError|fetch failed/i.test(msg);
    renderEmptyTryouts(
      target,
      transient ? { title: "We’re having trouble loading tryouts", desc: "This might be a temporary issue. Please refresh in a moment." } : void 0
    );
    sendMetric("dash_tryouts_err", { msg });
  }
}
function renderEmptyApps(target) {
  clearNode(target);
  const card = el("div", { className: "card" }, [
    el("h3", { text: "No applications yet" }),
    el("p", { className: "muted", text: "When you apply to a tryout, it will show up here." })
  ]);
  target.appendChild(card);
}
function renderAppCard(a) {
  const reel = a.reelLink || a.reel || "#";
  const when = a.timestamp || a.created_at || a.createdAt || (/* @__PURE__ */ new Date()).toISOString();
  const org = a.tryoutOrg || a.orgName || a.org || "Tryout";
  const status = String(a.status ?? "submitted").toUpperCase();
  const card = el("div", { className: "card" }, [
    el("div", { className: "badge", text: status }),
    el("div", { className: "mt-1" }, [el("strong", { text: String(org) })]),
    el("div", { className: "mt-2" }, [
      safeLink(reel, "Reel"),
      document.createTextNode(" • "),
      el("span", { className: "muted", text: new Date(when).toLocaleString() })
    ])
  ]);
  if (a.notes) {
    card.appendChild(el("div", { className: "mt-2", text: String(a.notes) }));
  }
  return card;
}
async function loadMyApplications() {
  const target = document.getElementById("dash-apps");
  if (!target) return;
  clearNode(target);
  target.appendChild(el("div", { className: "card" }, [el("h3", { text: "Loading applications…" })]));
  let s = null;
  try {
    s = await getAuthState();
  } catch {
  }
  const mySub = (s == null ? void 0 : s.sub) || null;
  async function trySeq(urls) {
    for (const u of urls) {
      try {
        return await robustFetch(u);
      } catch (e) {
        const msg = String(e);
        if (!/API 401|API 403|API 404/i.test(msg)) throw e;
      }
    }
    return null;
  }
  try {
    const cacheK = mySub ? cacheKey("/applications", mySub) : null;
    let apps = cacheK ? getCachedJson(cacheK, 60 * 1e3) : null;
    if (!apps) {
      const urls = [
        "/applications?me=true",
        mySub ? `/applications?applicantId=${encodeURIComponent(mySub)}` : null,
        mySub ? `/applications?userSub=${encodeURIComponent(mySub)}` : null,
        "/applications"
      ].filter(Boolean);
      apps = asItems(await trySeq(urls));
      if (Array.isArray(apps) && mySub) {
        const keys = ["applicantId", "userSub", "user_id", "userId", "owner", "createdBy", "sub", "user_sub"];
        apps = apps.filter((a) => keys.some((k) => ((a == null ? void 0 : a[k]) || "").toString() === mySub));
      }
      if (cacheK) setCachedJson(cacheK, apps);
    }
    if (!Array.isArray(apps) || !apps.length) {
      renderEmptyApps(target);
      return;
    }
    clearNode(target);
    apps.sort(
      (a, b) => new Date(b.timestamp || b.createdAt || b.created_at || 0) - new Date(a.timestamp || a.createdAt || a.created_at || 0)
    ).slice(0, 6).forEach((a) => target.appendChild(renderAppCard(a)));
  } catch (e) {
    const msg = String(e || "");
    console.error("dash apps error", { corr: PAGE_CORR_ID, msg });
    renderEmptyApps(target);
    sendMetric("dash_apps_err", { msg });
  }
}
async function init() {
  const t0 = performance.now();
  await Promise.all([loadRecommendedTryouts(), loadMyApplications()]);
  sendMetric("dash_loaded", { dur: Math.round(performance.now() - t0) });
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
