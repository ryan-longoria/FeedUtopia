import { apiFetch } from "/js/api.js";
import { getAuthState, isWrestler, isPromoter } from "/js/roles.js";

async function resolveMyProfileUrl() {
  const state = await getAuthState();
  if (!state) return null;

  if (isWrestler(state)) {
    try {
      const me = await apiFetch("/profiles/wrestlers/me");
      if (me?.handle) return `/w/#${encodeURIComponent(me.handle)}`;
    } catch {}
    return "/dashboard_wrestler.html";
  }

  if (isPromoter(state)) {
    try {
      const me = await apiFetch("/profiles/promoters/me");
      const id = me?.handle || me?.id || me?.sub || state.sub;
      if (id) return `/p/#${encodeURIComponent(id)}`;
    } catch {}
    if (state.sub) return `/p/#${encodeURIComponent(state.sub)}`;
    return "/dashboard_promoter.html";
  }

  return null;
}

function getAllMyProfileLinks() {
  return Array.from(
    document.querySelectorAll("#nav-my-profile, #my-profile-link, [data-myprofile]")
  );
}

let retries = 0;
async function upgradeMyProfileLinks() {
  const links = getAllMyProfileLinks();
  if (!links.length) {
    if (retries < 10) {
      retries++;
      setTimeout(upgradeMyProfileLinks, 200);
    }
    return;
  }

  const url = await resolveMyProfileUrl();
  if (!url) {
    if (retries < 10) {
      retries++;
      setTimeout(upgradeMyProfileLinks, 200);
    }
    return;
  }

  links.forEach((a) => {
    a.setAttribute("href", url);

    const handler = (e) => {
      e.preventDefault();
      location.href = url;
    };

    a.removeEventListener("click", a.__myprofileHandler);
    a.addEventListener("click", handler);
    a.__myprofileHandler = handler;
  });
  retries = 0;
}

window.addEventListener("partials:ready", upgradeMyProfileLinks);
window.addEventListener("auth:changed", upgradeMyProfileLinks);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", upgradeMyProfileLinks, { once: true });
} else {
  upgradeMyProfileLinks();
}

try {
  const cached =
    window.WU_USER || JSON.parse(localStorage.getItem("wuUser") || "null");
  if (cached && cached.handle) {
    const optimisticUrl =
      cached.role === "promoter"
        ? `/p/#${encodeURIComponent(cached.handle)}`
        : `/w/#${encodeURIComponent(cached.handle)}`;
    getAllMyProfileLinks().forEach((a) => a.setAttribute("href", optimisticUrl));
  }
} catch {}
