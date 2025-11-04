import { apiFetch, asItems } from "/js/api.js";

const TZ = "America/Chicago";
const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "short",
  day: "2-digit",
});

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "class") node.className = v;
    else if (k === "style") node.style.cssText = v;
    else node.setAttribute(k, v);
  }
  if (text != null) node.textContent = text;
  return node;
}

function safeDateText(d) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "";
  return DATE_FMT.format(dt);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const logCtx = () => ({
  page: location.pathname,
});

const log = {
  info: (msg, extra = {}) => console.info("[main]", msg, { ...logCtx(), ...extra }),
  warn: (msg, extra = {}) => console.warn("[main]", msg, { ...logCtx(), ...extra }),
  error: (msg, extra = {}) => console.error("[main]", msg, { ...logCtx(), ...extra }),
  debug: (msg, extra = {}) => console.debug("[main]", msg, { ...logCtx(), ...extra }),
};

async function withTimeout(promise, ms, controller) {
  const t = setTimeout(() => controller?.abort?.(), ms);
  try {
    return await promise;
  } finally {
    clearTimeout(t);
  }
}

async function getJson(path, { attempts = 3, signal, timeoutMs = 8000 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    const controller = new AbortController();
    const composite = signal
      ? new AbortController()
      : null;

    if (signal && composite) {
      const onAbort = () => controller.abort();
      signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      const p = apiFetch(path, { method: "GET", signal: controller.signal });
      const res = await withTimeout(p, timeoutMs, controller);
      return res;
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      if (/401/.test(msg) || e?.name === "AbortError" || i === attempts - 1) break;
      const backoff = 250 * 2 ** i + Math.random() * 120;
      await sleep(backoff);
    }
  }
  throw lastErr;
}

async function postJson(path, { body, signal, timeoutMs = 10000, headers = {} } = {}) {
  const controller = new AbortController();
  const p = apiFetch(path, {
    method: "POST",
    body,
    headers,
    signal: controller.signal,
  });
  return await withTimeout(p, timeoutMs, controller);
}

function decodeJWTPayload(id) {
  try {
    const b64 = id.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    if (!b64) return {};
    const bin = atob(b64);
    const json = decodeURIComponent(
      Array.from(bin)
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(json);
  } catch {
    return {};
  }
}

async function userGroups() {
  try {
    const { fetchAuthSession } = await import("/js/auth-bridge.js");
    const s = await fetchAuthSession();
    const id = s?.tokens?.idToken?.toString();
    if (!id) return [];
    const payload = decodeJWTPayload(id);
    const g = payload["cognito:groups"];
    return Array.isArray(g) ? g : typeof g === "string" && g ? [g] : [];
  } catch {
    return [];
  }
}

function highlightNav() {
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav-links a").forEach((a) => {
    if (a.getAttribute("href") === path) a.classList.add("active");
  });
}

function cacheGet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    return { ts, data };
  } catch {
    return null;
  }
}

function cacheSet(key, data) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
  }
}

async function renderHomeTryouts(groups, { signal } = {}) {
  const tryoutList = document.querySelector("#home-tryouts");
  if (!tryoutList) return;

  const isWrestler = groups.includes("Wrestlers");
  if (!isWrestler) {
    tryoutList.textContent = "";
    return;
  }

  const CACHE_KEY = "home_tryouts";
  const cached = cacheGet(CACHE_KEY);
  if (cached?.data) {
    paintTryoutsCards(tryoutList, asItems(cached.data).slice(0, 6));
  } else {
    tryoutList.textContent = "";
    tryoutList.append(el("p", { class: "muted" }, "Loading events..."));
  }

  try {
    let listObj;
    try {
      listObj = await getJson("/tryouts", { signal });
    } catch (e) {
      if (String(e).includes("401")) {
        tryoutList.textContent = "";
        tryoutList.append(el("p", { class: "muted" }, "Sign in to see current events."));
        return;
      }
      throw e;
    }

    cacheSet(CACHE_KEY, listObj);
    const list = asItems(listObj).slice(0, 6);
    paintTryoutsCards(tryoutList, list);
  } catch (err) {
    log.error("Failed to load home tryouts", { err: String(err) });
    tryoutList.textContent = "";
    tryoutList.append(el("p", { class: "muted" }, "Could not load events."));
  }
}

function paintTryoutsCards(container, items) {
  container.textContent = "";
  const top = Array.isArray(items) ? items : [];
  if (top.length === 0) {
    container.append(el("p", { class: "muted" }, "No open events yet."));
    return;
  }

  const cap = top.slice(0, 6);
  cap.forEach((t) => {
    const id = t.tryoutId || t.id || "";
    const eventName = t.eventName || t.event_name || t.title || "";
    const org = t.orgName || t.org || "";
    const city = t.city || "";
    const dateText = safeDateText(t.date);
    const reqs = t.requirements || "";
    const status = (t.status || "open").toUpperCase();

    const card = el("div", { class: "card", dataset: { tryoutId: id } });
    card.append(el("div", { class: "badge" }, status));

    const h3 = el("h3", { style: "margin:6px 0 2px" }, org);
    const meta = el("div", { class: "muted" }, [city, dateText].filter(Boolean).join(" • "));
    const p = el("p", { class: "mt-3" }, reqs);
    const a = el("a", { class: "btn small mt-3", href: "talent.html#search" }, "View");

    card.append(h3, meta, p, a);
    container.append(card);
  });
}

async function renderHomeTalentSpotlight(groups, { signal } = {}) {
  const spot = document.querySelector("#home-talent");
  if (!spot) return;

  const isPromoter = groups.includes("Promoters");
  if (!isPromoter) {
    const section = spot.closest("section");
    if (section) section.style.display = "none";
    return;
  }

  const CACHE_KEY = "home_talent";
  const cached = cacheGet(CACHE_KEY);
  if (cached?.data) {
    paintTalentCards(spot, asItems(cached.data).slice(0, 8));
  } else {
    spot.textContent = "";
    spot.append(el("p", { class: "muted" }, "Loading talent..."));
  }

  try {
    const listObj = await getJson("/profiles/wrestlers", { signal });
    cacheSet(CACHE_KEY, listObj);
    const list = asItems(listObj).slice(0, 8);
    paintTalentCards(spot, list);
  } catch (err) {
    log.warn("Talent spotlight hidden", { err: String(err) });
    const section = spot.closest("section");
    if (section) section.style.display = "none";
  }
}

function paintTalentCards(container, items) {
  container.textContent = "";
  const top = Array.isArray(items) ? items : [];
  if (top.length === 0) {
    container.append(el("p", { class: "muted" }, "No talent to show yet."));
    return;
  }

  const cap = top.slice(0, 8);
  cap.forEach((pItem) => {
    const ring = pItem.ring || pItem.ringName || pItem.name || "Wrestler";
    const name = pItem.name || "";
    const yrs = pItem.years ?? pItem.yearsExperience ?? 0;
    const styles = Array.isArray(pItem.styles) ? pItem.styles : [];
    const city = pItem.city || "";
    const avatar = pItem.avatar || `https://picsum.photos/seed/${encodeURIComponent(ring)}/200/200`;

    const card = el("div", { class: "card" });

    const profile = el("div", { class: "profile" });
    const img = el("img", { src: avatar, alt: `${ring} profile` });
    const info = el("div", { class: "info" });

    const nameLine = el("div");
    nameLine.append(
      el("strong", {}, ring),
      el("span", { class: "muted" }, ` (${name})`)
    );

    const meta = el("div", { class: "mt-2" }, [city, `${yrs} yrs`, styles.join(", ")].filter(Boolean).join(" • "));
    const btn = el("a", { class: "btn small mt-3", href: "talent.html#search" }, "View profiles");

    info.append(nameLine, meta, btn);
    profile.append(img, info);
    card.append(profile);
    container.append(card);
  });
}

async function renderTryoutsPage({ signal } = {}) {
  const grid = document.querySelector("#tryout-list");
  if (!grid) return;

  const CACHE_KEY = "tryouts_full";
  const cached = cacheGet(CACHE_KEY);
  if (cached?.data) {
    paintTryoutsGrid(grid, asItems(cached.data));
  } else {
    grid.textContent = "";
    grid.append(el("p", { class: "muted" }, "Loading events..."));
  }

  try {
    let listObj;
    try {
      listObj = await getJson("/tryouts", { signal });
    } catch (e) {
      if (String(e).includes("401")) {
        grid.textContent = "";
        grid.append(el("p", { class: "muted" }, "Sign in to see current events."));
        return;
      }
      throw e;
    }

    cacheSet(CACHE_KEY, listObj);
    const list = asItems(listObj);
    paintTryoutsGrid(grid, list);

    wireApplyFlow(grid, { signal });
  } catch (err) {
    log.error("Failed to load tryouts page", { err: String(err) });
    grid.textContent = "";
    grid.append(el("p", { class: "muted" }, "Could not load events."));
  }
}

function paintTryoutsGrid(grid, list) {
  grid.textContent = "";
  const items = Array.isArray(list) ? list : [];
  if (!items.length) {
    grid.append(el("p", { class: "muted" }, "No open events yet."));
    return;
  }

  items.slice(0, 200).forEach((t) => {
    const id = t.tryoutId || t.id || "";
    const eventName = t.eventName || t.event_name || t.title || "";
    const org = t.orgName || t.org || "";
    const city = t.city || "";
    const dateText = safeDateText(t.date);
    const reqs = t.requirements || "";
    const status = (t.status || "open").toUpperCase();

    const card = el("div", { class: "card" });
    card.append(el("div", { class: "badge" }, status));

    const h3 = el("h3", { style: "margin:6px 0 2px" }, eventName || org);
    const metaBits = [org && eventName ? org : null, city, dateText].filter(Boolean);
    const meta = el("div", { class: "muted" }, metaBits.join(" • "));
    const p = el("p", { class: "mt-3" }, reqs);

    const actions = el("div", { class: "mt-3" });
    const btn = el("button", { class: "btn small", dataset: { apply: id } }, "Apply");
    actions.append(btn);

    card.append(h3, meta, p, actions);
    grid.append(card);
  });
}

function wireApplyFlow(grid, { signal } = {}) {
  const modal = document.querySelector("#apply-modal");
  const form = document.querySelector("#apply-form");

  const supportsDialog = !!(modal && typeof modal.showModal === "function");

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-apply]");
    if (!btn) return;
    const id = btn.getAttribute("data-apply");
    if (modal) {
      const idInput = modal.querySelector('input[name="tryout_id"]');
      if (idInput) idInput.value = id;

      if (supportsDialog) {
        modal.showModal();
      } else {
        modal.classList.add("open");
      }
    }
  });

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const tryoutId = fd.get("tryout_id");
    const submitBtn = form.querySelector('[type="submit"]');

    const payload = {
      ring: (fd.get("ring") || "").toString(),
      name: (fd.get("name") || "").toString(),
      reel: (fd.get("reel") || "").toString(), 
      notes: (fd.get("notes") || "").toString(),
    };

    try {
      if (submitBtn) submitBtn.disabled = true;
      await postJson(`/tryouts/${encodeURIComponent(tryoutId)}/apply`, {
        body: payload,
        signal,
      });
      alert("Application submitted!");
      if (supportsDialog) modal?.close();
      else modal?.classList.remove("open");
      form.reset();
    } catch (err) {
      log.error("Apply submit failed", { err: String(err) });
      alert("Failed to submit application. Please try again.");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  modal?.addEventListener("click", (e) => {
    if (e.target === modal && !modal.open) modal.classList.remove("open");
  });
}

let bootInFlight = null;
let bootAbort = null;

async function start() {
  if (bootInFlight) {
    bootAbort?.abort();
    try {
      await bootInFlight;
    } catch {
    }
  }

  bootAbort = new AbortController();
  const { signal } = bootAbort;

  bootInFlight = (async () => {
    try {
      highlightNav();
      const groups = await userGroups();

      await Promise.all([
        renderHomeTryouts(groups, { signal }),
        renderHomeTalentSpotlight(groups, { signal }),
      ]);

      await renderTryoutsPage({ signal });
    } catch (err) {
      if (err?.name === "AbortError") {
        log.debug("Boot aborted");
      } else {
        log.error("Boot failed", { err: String(err) });
      }
    }
  })();

  try {
    await bootInFlight;
  } finally {
    bootInFlight = null;
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}

window.addEventListener("auth:changed", start);

window.__mainLoaded = true;
console.debug("[main] loaded");
