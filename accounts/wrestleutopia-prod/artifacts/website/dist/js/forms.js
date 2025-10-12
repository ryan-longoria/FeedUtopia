import { apiFetch, asItems } from "/js/api.js";
import { getAuthState, isPromoter, isWrestler } from "/js/roles.js";

function serializeForm(form) {
  const data = new FormData(form);
  const obj = {};
  for (const [k, v] of data.entries()) {
    if (obj[k]) obj[k] = Array.isArray(obj[k]) ? [...obj[k], v] : [obj[k], v];
    else obj[k] = v;
  }
  return obj;
}

function toast(text, type = "success") {
  const t = document.querySelector("#toast");
  if (!t) {
    (type === "error" ? console.error : console.log)(text);
    return;
  }
  t.textContent = text;
  t.classList.toggle("error", type === "error");
  t.style.display = "block";
  setTimeout(() => (t.style.display = "none"), 2600);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "text") node.textContent = v;
    else if (k === "class") node.className = v;
    else if (k === "dataset" && v && typeof v === "object") {
      Object.entries(v).forEach(([dk, dv]) => (node.dataset[dk] = dv));
    } else if (k === "props" && v && typeof v === "object") {
      Object.assign(node, v);
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const c of [].concat(children)) {
    if (c instanceof Node) node.appendChild(c);
    else if (typeof c === "string") node.appendChild(document.createTextNode(c));
  }
  return node;
}

function toNum(v, { min = 0, max = 999999 } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}
function clean(s, max = 200) {
  return (s ?? "").toString().trim().slice(0, max);
}
function cleanLong(s, max = 2000) {
  return (s ?? "").toString().trim().slice(0, max);
}

function isSafeHttpUrl(u) {
  try {
    const url = new URL(u, location.origin);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isAllowedImageUrl(u) {
  try {
    const url = new URL(u, location.origin);
    const allowed = [location.origin];
    if (window.WU_MEDIA_BASE) {
      const base = new URL(window.WU_MEDIA_BASE, location.origin);
      allowed.push(base.origin);
    }
    return (url.protocol === "http:" || url.protocol === "https:") &&
           allowed.includes(url.origin);
  } catch {
    return false;
  }
}

function debounce(fn, ms = 350) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

function parseJwtPayload(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    atob(b64)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
  return JSON.parse(json);
}

async function userGroups() {
  try {
    const { fetchAuthSession } = await import("/js/auth-bridge.js");
    const s = await fetchAuthSession();
    const id = s?.tokens?.idToken?.toString();
    if (!id) return [];
    const [, payloadB64] = id.split(".");
    const payload = parseJwtPayload(payloadB64);
    const expOk = typeof payload.exp === "number" && Date.now() / 1000 < payload.exp;
    if (!expOk) return [];
    const g = payload["cognito:groups"];
    return Array.isArray(g) ? g : g ? [g] : [];
  } catch {
    return [];
  }
}

function renderTalent(list) {
  const target = document.querySelector("#talent-list");
  if (!target) return;

  const items = Array.isArray(list) ? list : list ? [list] : [];
  target.replaceChildren();
  const frag = document.createDocumentFragment();

  const fallback = (ring) =>
    `https://picsum.photos/seed/${encodeURIComponent(ring)}/200/200`;

  for (const p of items) {
    const ring = clean(p.ring || p.ringName || p.stageName || p.name || "Wrestler", 80);
    const name = clean(p.name || "", 120);
    const yrs = toNum(p.years ?? p.yearsExperience ?? 0, { min: 0, max: 80 });
    const styles = Array.isArray(p.styles)
      ? p.styles
      : Array.isArray(p.gimmicks)
      ? p.gimmicks
      : [];
    const safeStyles = styles.map((g) => clean(g, 40)).filter(Boolean);

    const city = [p.city, p.region, p.country].map((s) => clean(s, 60)).filter(Boolean).join(", ");
    const rateMin = toNum(p.rate_min ?? p.rateMin ?? 0, { min: 0, max: 1_000_000 });
    const rateMax = toNum(p.rate_max ?? p.rateMax ?? 0, { min: 0, max: 1_000_000 });
    const verified = !!p.verified_school || !!p.verifiedSchool;
    const reel = clean(p.reel || p.reelLink || "", 1000);
    const photoKey = p.photoKey && window.WU_MEDIA_BASE ? `${window.WU_MEDIA_BASE}/${p.photoKey}` : "";
    const avatar = (p.avatar && clean(p.avatar, 1000)) || photoKey || fallback(ring);

    const card = el("div", { class: "card" });

    const profile = el("div", { class: "profile" });

    const img = el("img", {
      alt: `${ring} profile`,
      class: "avatar"
    });
    if (isAllowedImageUrl(avatar)) {
      img.src = avatar;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
    } else {
      const fb = fallback(ring);
      img.src = fb;
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
    }

    const info = el("div", { class: "info" });

    const nameRow = el("div", {}, [
      el("strong", { text: ring }),
      " ",
      el("span", { class: "muted", text: name ? `(${name})` : "" })
    ]);

    const meta = el("div", { class: "mt-2" }, [
      el("span", { text: city || "—" }),
      " • ",
      el("span", { text: `${yrs} yrs` }),
      " • ",
      el("span", { text: safeStyles.join(", ") })
    ]);

    const school = verified
      ? el("div", { class: "mt-2" }, [el("span", { class: "badge", text: "Verified school" })])
      : el("div");

    const rate = el("div", { class: "mt-2 muted", text: `Rate: $${rateMin}-${rateMax}` });

    const actions = el("div", { class: "mt-3 actions-row" });
    const viewBtn = el("button", {
      class: "btn small view-profile-btn",
      type: "button",
      text: "View Profile",
      props: { ariaLabel: `View profile for ${ring}` }
    });
    actions.appendChild(viewBtn);

    if (p.handle) {
      const handleUrl = `/w/#${encodeURIComponent(p.handle)}`;
      const seeFull = el("a", {
        class: "btn small secondary",
        href: handleUrl,
        text: "See Full Profile",
        rel: "noopener noreferrer"
      });
      actions.appendChild(seeFull);
    }

    info.appendChild(nameRow);
    info.appendChild(meta);
    info.appendChild(school);
    info.appendChild(rate);
    info.appendChild(actions);

    profile.appendChild(img);
    profile.appendChild(info);
    card.appendChild(profile);

    viewBtn.addEventListener("click", () => {
      const box = document.getElementById("wm-content");
      if (box) {
        const wrap = document.createDocumentFragment();

        const top = el("div", { class: "profile-top" });
        const big = el("img", {
          alt: "Avatar",
          class: "avatar-lg",
          props: { loading: "lazy", decoding: "async", referrerPolicy: "no-referrer" }
        });
        big.src = isAllowedImageUrl(avatar) ? avatar : fallback(ring);

        const topInfo = el("div");
        topInfo.appendChild(el("h2", { text: ring }));
        topInfo.appendChild(el("div", { class: "muted", text: city || "" }));
        const chips = el("div", { class: "chips mt-2" }, safeStyles.map((g) => el("span", { class: "chip", text: g })));
        topInfo.appendChild(chips);

        top.appendChild(big);
        top.appendChild(topInfo);

        const bioEl = el("div", { class: "mt-3" });
        const bioText = (p.bio ?? "").toString();
        const bioP = el("p", { class: bioText ? "" : "muted" });
        bioP.style.whiteSpace = "pre-line";
        bioP.textContent = bioText || "No bio yet.";
        bioEl.appendChild(bioP);

        const dl = el("dl", { class: "mt-3" });
        dl.appendChild(el("dt", { class: "muted", text: "Name" }));
        dl.appendChild(el("dd", { text: name || "—" }));
        if (p.dob) {
          dl.appendChild(el("dt", { class: "muted mt-2", text: "DOB" }));
          dl.appendChild(el("dd", { text: String(p.dob) }));
        }
        if (verified) {
          dl.appendChild(el("dt", { class: "muted mt-2", text: "School" }));
          dl.appendChild(el("dd", { text: "Verified" }));
        }

        wrap.appendChild(top);
        wrap.appendChild(bioEl);
        wrap.appendChild(dl);

        if (reel && isSafeHttpUrl(reel)) {
          wrap.appendChild(
            el("div", { class: "mt-3" }, [
              el("a", {
                class: "btn small secondary",
                href: reel,
                target: "_blank",
                rel: "noopener noreferrer",
                text: "Watch Reel"
              })
            ])
          );
        }

        box.replaceChildren(wrap);
      }
      document.getElementById("wrestler-modal")?.showModal();
    });

    frag.appendChild(card);
  }

  target.appendChild(frag);
}

function renderTryouts(list) {
  const target = document.querySelector("#tryout-list");
  if (!target) return;

  target.replaceChildren();
  const items = Array.isArray(list) ? list : list ? [list] : [];

  if (items.length === 0) {
    target.appendChild(el("p", { class: "muted", text: "No open tryouts yet." }));
    return;
  }

  const frag = document.createDocumentFragment();

  for (const t of items) {
    const id = clean(t.tryoutId || t.id || "", 128);
    const org = clean(t.orgName || t.org || "", 140);
    const ownerId = clean(t.ownerId || "", 140);
    const city = clean(t.city || "", 120);
    const dateStr = t.date ? new Date(t.date).toLocaleDateString() : "";
    const reqs = cleanLong(t.requirements || "", 2000);
    const slots = toNum(t.slots ?? 0, { min: 0, max: 100000 });
    const status = String(t.status || "open").toUpperCase();

    const card = el("div", { class: "card", dataset: { tryoutId: id } });
    const badge = el("div", { class: "badge", text: status });
    card.appendChild(badge);

    const h3 = el("h3", { class: "mt-1 mb-0" });
    if (ownerId) {
      const a = el("a", {
        href: `/p/#${encodeURIComponent(ownerId)}`,
        text: org || "Organization",
        rel: "noopener noreferrer"
      });
      h3.appendChild(a);
    } else {
      h3.textContent = org || "Organization";
    }
    card.appendChild(h3);

    card.appendChild(el("div", { class: "muted", text: `${city}${city && dateStr ? " • " : ""}${dateStr}` }));
    card.appendChild(el("p", { class: "mt-3", text: reqs }));

    const actions = el("div", { class: "mt-3" });
    const applyBtn = el("button", {
      class: "btn small apply-btn",
      text: "Apply",
      dataset: { id, org }
    });
    const slotsEl = el("span", { class: "muted ml-2", text: `Slots: ${slots}` });

    actions.appendChild(applyBtn);
    actions.appendChild(slotsEl);
    card.appendChild(actions);

    frag.appendChild(card);
  }

  target.appendChild(frag);

  getAuthState().then((s) => {
    const allow = isWrestler(s);
    document.querySelectorAll(".apply-btn").forEach((btn) => {
      if (!allow) {
        btn.textContent = "Log in as Wrestler to apply";
        btn.addEventListener(
          "click",
          (e) => {
            e.preventDefault();
            document.querySelector("#login-btn")?.click();
          },
          { once: true }
        );
      } else {
        btn.addEventListener("click", (e) => {
          const b = e.currentTarget;
          openApply(b.dataset.id, b.dataset.org);
        });
      }
    });
  });
}

function renderApps(list) {
  const target = document.querySelector("#app-list");
  if (!target) return;
  target.replaceChildren();

  const frag = document.createDocumentFragment();
  for (const a of list || []) {
    const reel = clean(a.reelLink || a.reel || "", 1000);
    const when = a.timestamp || a.created_at || a.createdAt || new Date().toISOString();
    const notes = cleanLong(a.notes || "", 2000);
    const who = a.applicantId ? `Applicant: ${clean(a.applicantId, 160)}` : "";

    const card = el("div", { class: "card" });
    card.appendChild(el("div", {}, [el("strong", { text: who })]));

    const line = el("div", { class: "mt-2" });
    if (reel && isSafeHttpUrl(reel)) {
      const link = el("a", {
        href: reel,
        text: "Reel",
        target: "_blank",
        rel: "noopener noreferrer"
      });
      line.appendChild(link);
      line.appendChild(document.createTextNode(" • "));
    }
    line.appendChild(el("span", { class: "muted", text: new Date(when).toLocaleString() }));
    card.appendChild(line);

    card.appendChild(el("div", { class: "mt-2", text: notes }));
    frag.appendChild(card);
  }

  target.appendChild(frag);
}

function openApply(id, org) {
  const f = document.querySelector("#apply-form");
  if (!f) return;
  if (id) f.tryout_id.value = id;
  const title = document.querySelector("#apply-title");
  if (title) title.textContent = "Apply to " + (org || "Tryout");
  const modal = document.querySelector("#apply-modal");
  modal?.showModal();
}

let searchAbort;

async function renderTalentSearchPanel() {
  const searchForm = document.querySelector("#talent-search");
  const resultsWrap =
    document.querySelector("#talent-list")?.closest("section, .card, .panel") ||
    document.querySelector("#talent-list");
  if (!searchForm) return;

  const s = await getAuthState();
  if (!isPromoter(s)) {
    if (resultsWrap) {
      const card = el("div", { class: "card" }, [
        el("h2", {}, [document.createTextNode("Talent Search "), el("span", { class: "badge", text: "Locked" })]),
        el("p", {
          class: "muted",
          text: "Only promoters can search wrestler profiles. Create a free promoter account."
        })
      ]);
      resultsWrap.replaceChildren(card);
    } else {
      (searchForm.closest("section, .card, .panel") || searchForm).style.display = "none";
    }
    return;
  }

  const doFilter = async () => {
    try {
      const o = serializeForm(searchForm);
      const qs = new URLSearchParams();
      if (o.style && o.style !== "any") qs.set("style", clean(o.style, 40));
      if (o.city) qs.set("city", clean(o.city, 120));
      if (o.verified === "true") qs.set("verified", "true");
      if (o.q) qs.set("q", clean(o.q, 160));

      const path = `/profiles/wrestlers${qs.toString() ? "?" + qs.toString() : ""}`;

      searchAbort?.abort();
      searchAbort = new AbortController();

      const list = await apiFetch(path, { signal: searchAbort.signal });
      renderTalent(list);
    } catch (err) {
      if (err?.name === "AbortError") return;
      console.error(err);
      toast("You must be a promoter to view talent profiles.", "error");
      renderTalent([]);
    }
  };

  const onFilter = debounce(doFilter, 350);
  ["input", "change"].forEach((evt) => searchForm.addEventListener(evt, onFilter));
  doFilter();
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
      if (/^[a-zA-Z0-9_\-:]{1,128}$/.test(id)) {
        requestAnimationFrame(() => {
          document.querySelector(`[data-tryout-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: "smooth" });
        });
      }
    }
  } catch (err) {
    if (String(err).includes("API 401")) {
      listEl.replaceChildren(el("p", { class: "muted", text: "Please sign in to view tryouts." }));
      return;
    }
    console.error(err);
    listEl.replaceChildren(el("p", { class: "muted", text: "Could not load tryouts." }));
  }
}

async function renderAppsPanel() {
  const apps = document.querySelector("#app-list");
  if (!apps) return;

  try {
    const url = new URL(location.href);
    const tId = url.searchParams.get("tryout");
    const path = tId ? `/applications?tryoutId=${encodeURIComponent(clean(tId, 128))}` : "/applications";
    const list = await apiFetch(path);
    renderApps(list);
  } catch (err) {
    console.error(err);
    renderApps([]);
  }
}

function disableWhileRunning(btn, fn) {
  return async (...args) => {
    if (!btn) return fn(...args);
    if (btn.dataset.locked === "1") return;
    btn.dataset.locked = "1";
    btn.disabled = true;
    try {
      return await fn(...args);
    } finally {
      btn.disabled = false;
      btn.dataset.locked = "";
    }
  };
}

async function wireForms() {
  const talentForm = document.querySelector("#talent-form");
  if (talentForm) {
    const submitBtn = talentForm.querySelector('button[type="submit"]');
    talentForm.addEventListener(
      "submit",
      disableWhileRunning(submitBtn, async (e) => {
        e.preventDefault();
        try {
          const o = serializeForm(talentForm);
          const styles = (Array.isArray(o.styles) ? o.styles : [o.styles]).filter(Boolean).map((s) => clean(s, 40));

          const body = {
            name: clean(o.name, 120),
            ring: clean(o.ring, 80),
            city: clean(o.city, 120),
            travel: toNum(o.travel, { min: 0, max: 20000 }),
            height_cm: toNum(o.height_cm, { min: 0, max: 300 }),
            weight_kg: toNum(o.weight_kg, { min: 0, max: 400 }),
            years: toNum(o.years, { min: 0, max: 80 }),
            school: clean(o.school, 160),
            styles,
            reel: (o.reel && isSafeHttpUrl(o.reel)) ? clean(o.reel, 1000) : "",
            rate_min: toNum(o.rate_min, { min: 0, max: 1_000_000 }),
            rate_max: toNum(o.rate_max, { min: 0, max: 1_000_000 }),
            verified_school: false
          };

          if (body.rate_max < body.rate_min) {
            toast("Max rate cannot be less than min rate.", "error");
            return;
          }

          await apiFetch("/profiles/wrestlers", {
            method: "POST",
            body,
            headers: { "Idempotency-Key": crypto.randomUUID() }
          });
          toast("Talent profile saved!");
          talentForm.reset();
        } catch (err) {
          console.error(err);
          toast("Could not save profile", "error");
        }
      })
    );
  }

  const tryoutForm = document.querySelector("#tryout-form");
  if (tryoutForm) {
    const submitBtn = tryoutForm.querySelector('button[type="submit"]');
    tryoutForm.addEventListener(
      "submit",
      disableWhileRunning(submitBtn, async (e) => {
        e.preventDefault();
        try {
          const o = serializeForm(tryoutForm);
          const dateIso = o.date ? new Date(o.date).toISOString() : "";
          const today = new Date();
          if (dateIso && new Date(dateIso) < new Date(today.toDateString())) {
            toast("Date must be today or later.", "error");
            return;
          }
          const slots = toNum(o.slots, { min: 0, max: 100000 });

          const body = {
            orgName: clean(o.org, 140),
            city: clean(o.city, 120),
            date: dateIso,
            slots,
            requirements: cleanLong(o.requirements, 2000),
            contact: clean(o.contact, 200),
            status: "open"
          };

          await apiFetch("/tryouts", {
            method: "POST",
            body,
            headers: { "Idempotency-Key": crypto.randomUUID() }
          });
          toast("Tryout posted!");
          tryoutForm.reset();
          await renderTryoutsListPanel();
        } catch (err) {
          console.error(err);
          toast("Could not post tryout", "error");
        }
      })
    );
  }

  const appForm = document.querySelector("#apply-form");
  if (appForm) {
    const submitBtn = appForm.querySelector('button[type="submit"]');
    appForm.addEventListener(
      "submit",
      disableWhileRunning(submitBtn, async (e) => {
        e.preventDefault();
        try {
          const o = serializeForm(appForm);
          const body = {
            tryoutId: clean(o.tryout_id, 128),
            notes: cleanLong(o.notes, 2000),
            reelLink: (o.reel && isSafeHttpUrl(o.reel)) ? clean(o.reel, 1000) : ""
          };
          await apiFetch("/applications", {
            method: "POST",
            body,
            headers: { "Idempotency-Key": crypto.randomUUID() }
          });
          toast("Application sent!");
          appForm.reset();
          document.querySelector("#apply-modal")?.close();
          await renderAppsPanel();
        } catch (err) {
          console.error(err);
          toast("Could not submit application", "error");
        }
      })
    );
  }

  await Promise.all([
    renderTalentSearchPanel(),
    renderTryoutsListPanel(),
    renderAppsPanel()
  ]);
}

document.addEventListener("DOMContentLoaded", wireForms);
window.addEventListener("auth:changed", wireForms);
