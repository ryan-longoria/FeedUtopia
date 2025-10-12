import { getAuthState, isPromoter, isWrestler } from "/js/roles.js";

const AUTH_TIMEOUT_MS = 1500;
const SELECTOR = "#free-offer";
const HIDE_CLASS = "is-hidden";

const logErr = (where, err) =>
  console.error(`[free-offer-hide] ${where}`, { message: String(err) });

const withTimeout = (p, ms, label = "operation") =>
  Promise.race([
    p,
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);

const hideOffer = () => {
  document.querySelectorAll(SELECTOR).forEach((el) => {
    el.classList.add(HIDE_CLASS);
    el.setAttribute("aria-hidden", "true");
  });
};

const shouldHide = (state) => {
  try {
    return isPromoter(state) || isWrestler(state);
  } catch {
    return false;
  }
};

const run = async () => {
  try {
    const state = await withTimeout(getAuthState(), AUTH_TIMEOUT_MS, "getAuthState");
    if (shouldHide(state)) hideOffer();
  } catch (e) {
    if (!String(e).includes("timed out")) logErr("run", e);
  }
};

let mo;
const startObserver = () => {
  if (mo) return;
  mo = new MutationObserver(() => {
    if (document.querySelector(SELECTOR)) {
      run().catch(() => {});
    }
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => mo?.disconnect(), 5000);
};

const schedule = (fn) =>
  (window.requestIdleCallback
    ? requestIdleCallback(fn, { timeout: 1000 })
    : setTimeout(fn, 0));

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    schedule(run);
    startObserver();
  }, { once: true });
} else {
  schedule(run);
  startObserver();
}

window.addEventListener("auth:ready", () => {
  run().catch(() => {});
}, { once: true });
