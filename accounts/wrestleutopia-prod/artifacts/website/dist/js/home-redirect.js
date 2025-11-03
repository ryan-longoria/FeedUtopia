import { getAuthState, isPromoter, isWrestler } from "/js/roles.js";

const AUTH_TIMEOUT_MS = 8000;
const ONCE_KEY = "__home_redirect_done";

const isHomePath = () => {
  const p = location.pathname.replace(/\/+$/, "") || "/";
  return p === "/" || p === "/index.html";
};

const noredirect = () =>
  new URLSearchParams(location.search).has("noredirect") ||
  document.querySelector('meta[name="no-home-redirect"][content="true"]');

const withTimeout = (p, ms, label = "op") =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label} timed out`)), ms)),
  ]);

const targetFor = (s) => {
  if (isPromoter(s)) return "/dashboard_promoter.html";
  if (isWrestler(s)) return "/dashboard_wrestler.html";
  return null;
};

let scheduled = false;
const go = async () => {
  if (scheduled || !isHomePath() || noredirect() || sessionStorage.getItem(ONCE_KEY)) return;
  scheduled = true;

  try {
    const state = await withTimeout(getAuthState(), AUTH_TIMEOUT_MS, "getAuthState");
    const dest = state && targetFor(state);
    if (!dest) return;

    const url = new URL(dest, location.origin);
    if (url.origin !== location.origin) return;

    sessionStorage.setItem(ONCE_KEY, "1");
    location.replace(url.pathname + url.search + url.hash);
  } catch {
  }
};

const schedule = (fn) =>
  (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 800 }) : setTimeout(fn, 0));

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => schedule(go), { once: true });
} else {
  schedule(go);
}

window.addEventListener("auth:changed", () => schedule(go), { once: true });