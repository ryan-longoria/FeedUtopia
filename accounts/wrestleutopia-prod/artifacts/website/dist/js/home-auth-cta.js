const INTENTS = new Set(["generic", "promoter", "wrestler"]);
const CLICK_DEBOUNCE_MS = 300;

let lastClickAt = 0;
let queuedOpen = null;

const logErr = (where, err, extra = {}) =>
  console.error(`[auth-cta] ${where}`, { message: String(err), ...extra });

const isAllowedIntent = (val) => (val && INTENTS.has(val) ? val : "generic");

function openSignup(intent = "generic") {
  const allowed = isAllowedIntent(intent);
  try {
    if (window.Auth?.open) {
      window.Auth.open("signup", { intent: allowed });
    } else {
      queuedOpen = { intent: allowed };
      window.dispatchEvent(
        new CustomEvent("auth:open", { detail: { mode: "signup", intent: allowed } })
      );
    }
  } catch (e) {
    logErr("openSignup", e, { intent: allowed });
  }
}

window.addEventListener("auth:changed", () => {
  if (queuedOpen && window.Auth?.open) {
    try {
      window.Auth.open("signup", { intent: queuedOpen.intent });
    } catch (e) {
      logErr("auth:changed", e, { intent: queuedOpen?.intent });
    } finally {
      queuedOpen = null;
    }
  }
});

const safeNavigate = (href) => {
  if (!href) return;
  try {
    if (href.startsWith("/")) {
      window.location.href = href;
      return;
    }
    const url = new URL(href, window.location.origin);
    if (url.origin === window.location.origin) {
      window.location.href = url.href;
    }
  } catch (e) {
    logErr("safeNavigate", e, { href });
  }
};

document.addEventListener(
  "click",
  (e) => {
    const el = e.target?.closest?.("a,button");
    if (!el) return;

    const now = performance?.now?.() ?? Date.now();
    if (now - lastClickAt < CLICK_DEBOUNCE_MS) return;
    lastClickAt = now;

    if (el.dataset.auth === "out") {
      e.preventDefault();
      openSignup(isAllowedIntent(el.dataset.intent));
      return;
    }

    if (el.dataset.requires) {
      e.preventDefault();
      openSignup(isAllowedIntent(el.dataset.requires));
      return;
    }

    if (el.tagName === "A") {
      const href = el.getAttribute("href");
      if (href && !/^https?:\/\//i.test(href)) {
        e.preventDefault();
        safeNavigate(href);
      }
    }
  },
  { passive: false }
);