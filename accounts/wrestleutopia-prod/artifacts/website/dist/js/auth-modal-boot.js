(function () {
  const waitFor = (sel) =>
    new Promise((resolve) => {
      const now = document.querySelector(sel);
      if (now) return resolve(now);

      const mo = new MutationObserver(() => {
        const el = document.querySelector(sel);
        if (el) { mo.disconnect(); resolve(el); }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });

      window.addEventListener("partials:ready", () => {
        const el = document.querySelector(sel);
        if (el) { mo.disconnect(); resolve(el); }
      }, { once: true });

      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          const el = document.querySelector(sel);
          if (el) { mo.disconnect(); resolve(el); }
        }, { once: true });
      }
    });

  async function getDlg() {
    const dlg = await waitFor("#auth-modal");
    return dlg;
  }

  async function showLogin() {
    const dlg = await getDlg();
    try {
      (window.authShowLogin?.() ?? (() => {}))();
      dlg.showModal();
    } catch (e) {
      console.error("[auth-boot] showLogin failed", e);
    }
  }

  async function showSignup(intentRole) {
    const dlg = await getDlg();
    try {
      (window.authShowSignup?.(intentRole) ?? (() => {}))();
      dlg.showModal();
    } catch (e) {
      console.error("[auth-boot] showSignup failed", e);
    }
  }

  window.openLogin = showLogin;
  window.openSignup = showSignup;

  document.addEventListener("click", (e) => {
    const loginBtn = e.target?.closest?.("#login-btn,[data-k='sticky_join_talent'],[data-k='sticky_join_promoter']");
    if (!loginBtn) return;
    e.preventDefault();
    const intent = loginBtn.matches("[data-k='sticky_join_promoter']") ? "promoter" :
                   loginBtn.matches("[data-k='sticky_join_talent']") ? "wrestler" : undefined;
    intent ? showSignup(intent) : showLogin();
  }, { capture: true });

  window.addEventListener("auth:open", (e) => {
    const intent = (e?.detail?.intent || "").toString().toLowerCase();
    if (intent === "promoter" || intent === "wrestler") showSignup(intent);
    else showLogin();
  });
})();

window.addEventListener("auth:changed", async (e) => {
  if (e?.detail?.type !== "signedIn") return;

  try {
    const { getAuthState, isPromoter, isWrestler } = await import("/js/roles.js");
    const s = await getAuthState();
    const dest = isPromoter(s) ? "/p" : isWrestler(s) ? "/w" : "/index.html";
    if (location.pathname !== dest) location.replace(dest);
  } catch {}
});