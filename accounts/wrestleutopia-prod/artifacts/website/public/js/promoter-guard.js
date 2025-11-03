import { getAuthState, isPromoter } from "/js/roles.js";

(() => {
  const init = () => {
    if (document.documentElement.dataset.promoterGuard === "1") return;
    document.documentElement.dataset.promoterGuard = "1";

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
        if (!isPromoter(state)) {
          redirectHome();
          return;
        }
        document.documentElement.dataset.auth = "ok";
      })
      .catch(() => {
        redirectHome();
      });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
