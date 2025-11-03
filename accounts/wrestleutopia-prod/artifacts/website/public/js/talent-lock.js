import { getAuthState, isPromoter } from "/js/roles.js";

(() => {
  const AUTH_TIMEOUT_MS = 8000;

  const init = () => {
    const sec = document.querySelector("#search");
    if (!sec) return;

    if (sec.dataset.talentLockInit === "1") return;
    sec.dataset.talentLockInit = "1";

    sec.setAttribute("aria-busy", "true");
    sec.inert = true;

    const safeHome = new URL("/signup?role=promoter", location.origin);

    const authWithTimeout = Promise.race([
      getAuthState(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("auth-timeout")), AUTH_TIMEOUT_MS)),
    ]);

    authWithTimeout
      .then((state) => {
        if (isPromoter(state)) {
          unlock(sec);
          return;
        }
        renderLocked(sec, safeHome);
      })
      .catch(() => {
        renderLocked(sec, safeHome);
      });
  };

  function unlock(sec) {
    sec.removeAttribute("aria-busy");
    sec.inert = false;
  }

  function renderLocked(sec, safeHome) {
    const title = document.createElement("h2");
    title.textContent = "Talent Search ";

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "Locked";
    title.appendChild(badge);

    const wrap = document.createElement("div");
    wrap.className = "mt-2";

    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Only promoters can search wrestler profiles.";

    const btn = document.createElement("a");
    btn.className = "btn small";
    btn.setAttribute("data-auth", "out");
    btn.setAttribute("role", "button");
    btn.href = safeHome.href;
    btn.textContent = "Create a free promoter account";

    btn.addEventListener("click", (e) => {
      if (btn.getAttribute("href") === "#") e.preventDefault();
      location.assign(safeHome.href);
    }, { passive: true });

    wrap.append(p, btn);

    sec.replaceChildren(title, wrap);

    unlock(sec);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
