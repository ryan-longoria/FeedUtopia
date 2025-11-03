import { getAuthState, isWrestler } from "/js/roles.js";

(() => {
  const init = () => {
    if (document.documentElement.dataset.wrestlerGuard === "1") return;
    document.documentElement.dataset.wrestlerGuard = "1";

    document.documentElement.dataset.auth = "pending";

    const SAFE_HOME = new URL("/index.html", location.origin);
    const alreadyHome = location.pathname === SAFE_HOME.pathname;

    const redirectHome = () => {
      if (!alreadyHome) location.replace(SAFE_HOME.href);
    };

    const AUTH_TIMEOUT_MS = 8000;
    const authWithTimeout = Promise.race([
      getAuthState(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("auth-timeout")), AUTH_TIMEOUT_MS)),
    ]);

    authWithTimeout
      .then((state) => {
        if (!isWrestler(state)) {
          redirectHome();
          return;
        }

        const pct = clamp0to100(computeProgress(state));

        requestAnimationFrame(() => {
          updateProgressBar(pct);
          document.documentElement.dataset.auth = "ok";
        });
      })
      .catch(() => {
        redirectHome();
      });
  };

  function computeProgress(state) {
    const direct =
      state?.wrestler?.profile?.completionPct ??
      state?.profile?.completionPct ??
      state?.wrestler?.completionPct;

    if (Number.isFinite(direct)) return direct;

    const w = state?.wrestler || {};
    const checks = [
      !!w.handle,
      !!w.displayName,
      !!w.avatarUrl,
      !!w.bio,
      !!w.weightClass,
      !!w.location,
      Array.isArray(w.media) && w.media.length > 0,
      Array.isArray(w.highlights) && w.highlights.length > 0,
      !!w.contactEmail,
    ];
    const have = checks.filter(Boolean).length;
    const total = checks.length;

    return (have / total) * 100 || 0;
  }

  function clamp0to100(n) {
    const x = Number.isFinite(n) ? n : 0;
    return Math.max(0, Math.min(100, Math.round(x)));
  }

  function updateProgressBar(pct) {
    const bar = document.getElementById("profile-pct");
    const label = document.getElementById("profile-pct-label");
    const region = document.getElementById("profile-progress") || bar;

    const reduced = matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

    if (bar) {
      if (reduced) bar.style.transition = "none";
      bar.style.width = pct + "%";
    }
    if (label) {
      label.textContent = pct + "% complete";
    }
    if (region) {
      if (!region.hasAttribute("role")) region.setAttribute("role", "progressbar");
      region.setAttribute("aria-valuemin", "0");
      region.setAttribute("aria-valuemax", "100");
      region.setAttribute("aria-valuenow", String(pct));
      region.setAttribute("aria-valuetext", `${pct}% complete`);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
