import { getAuthState, isPromoter, isWrestler } from "/js/roles.js";

const AUTH_TIMEOUT_MS = 1500;
const GRID_SEL = "#home-tryouts";
const BTN_LABEL = "Create free wrestler account";
const BTN_INTENT = "wrestler";
let rendered = false;

const logErr = (where, err, extra = {}) =>
  console.error("[tryouts-locked]", { where, message: String(err), ...extra });

const withTimeout = (p, ms, label = "op") =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out`)), ms)),
  ]);

const isAuthed = (s) => {
  try {
    return isPromoter(s) || isWrestler(s);
  } catch {
    return false;
  }
};

const lockedSVGDataURI = () => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" role="img" aria-label="Locked tryout">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b1f3a"/><stop offset="1" stop-color="#0e1228"/></linearGradient></defs>` +
    `<rect width="200" height="200" fill="url(#g)"/>` +
    `<g fill="none" stroke="#6a78ff" stroke-width="2" opacity="0.35">` +
    `<circle cx="100" cy="100" r="70"/><circle cx="100" cy="100" r="50"/></g>` +
    `<path d="M100 78a16 16 0 0 1 16 16v10h-32V94a16 16 0 0 1 16-16z" fill="#d6dbff"/>` +
    `<rect x="68" y="104" width="64" height="48" rx="8" fill="#b9c1ff"/>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const card = () => {
  const card = document.createElement("div");
  card.className = "card locked-card wrestler-only";

  const profile = document.createElement("div");
  profile.className = "profile blurred";
  card.appendChild(profile);

  const img = document.createElement("img");
  img.width = 200;
  img.height = 200;
  img.loading = "lazy";
  img.alt = "Locked tryout";
  img.src = lockedSVGDataURI();
  profile.appendChild(img);

  const info = document.createElement("div");
  info.className = "info";
  profile.appendChild(info);

  const line1 = document.createElement("div");
  line1.innerHTML = `<strong>— — —</strong> <span class="muted">(— — —)</span>`;
  info.appendChild(line1);

  const line2 = document.createElement("div");
  line2.className = "mt-2";
  line2.textContent = "— — • —/—/— • —, —";
  info.appendChild(line2);

  const p = document.createElement("p");
  p.className = "mt-2 muted";
  p.textContent = "Full details and one-click apply are available to wrestlers.";
  info.appendChild(p);

  const a = document.createElement("a");
  a.className = "btn small mt-3";
  a.href = "#";
  a.dataset.auth = "out";
  a.dataset.intent = BTN_INTENT;
  a.setAttribute("role", "button");
  a.textContent = BTN_LABEL;
  info.appendChild(a);

  return card;
};

const decideCount = (gridEl) => {
  const w = gridEl.clientWidth || window.innerWidth;
  if (w >= 900) return 3;
  if (w >= 600) return 2;
  return 1;
};

const renderLocked = (grid) => {
  if (!grid || rendered) return;
  rendered = true;
  const frag = document.createDocumentFragment();
  const n = decideCount(grid);
  for (let i = 0; i < n; i++) frag.appendChild(card());
  grid.replaceChildren(frag);
};

const run = async () => {
  try {
    const state = await withTimeout(getAuthState(), AUTH_TIMEOUT_MS, "getAuthState");
    if (isAuthed(state)) return;

    const grid = document.querySelector(GRID_SEL);
    if (grid) {
      renderLocked(grid);
    } else {
      const mo = new MutationObserver(() => {
        const g = document.querySelector(GRID_SEL);
        if (g) {
          renderLocked(g);
          mo.disconnect();
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => mo.disconnect(), 5000);
    }
  } catch (e) {
    const grid = document.querySelector(GRID_SEL);
    if (grid) renderLocked(grid);
    else logErr("run", e);
  }
};

const schedule = (fn) =>
  (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 800 }) : setTimeout(fn, 0));

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => schedule(run), { once: true });
} else {
  schedule(run);
}

window.addEventListener("auth:ready", () => {
  if (!rendered) run().catch(() => {});
}, { once: true });