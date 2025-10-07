// /js/nav-myprofile.js
import { apiFetch } from "/js/api.js";
import { getAuthState, isWrestler, isPromoter } from "/js/roles.js";

async function resolveMyProfileUrl() {
  const state = await getAuthState(); // { sub, groups, ... }
  if (!state) return "#";

  // Wrestler: prefer public handle from API
  if (isWrestler(state)) {
    try {
      const me = await apiFetch("/profiles/wrestlers/me"); // should return { handle?, ... }
      if (me?.handle) return `/w/#${encodeURIComponent(me.handle)}`;
    } catch {}
    // No public profile yet → send to their dashboard to finish setup
    return "/dashboard_wrestler.html";
  }

  // Promoter: try API first (handle / publicId), fall back to sub
  if (isPromoter(state)) {
    try {
      const me = await apiFetch("/profiles/promoters/me"); // ideally returns { handle? id? sub? }
      const id = me?.handle || me?.id || me?.sub || state.sub;
      if (id) return `/p/#${encodeURIComponent(id)}`;
    } catch {}
    if (state.sub) return `/p/#${encodeURIComponent(state.sub)}`;
    return "/dashboard_promoter.html";
  }

  return "#";
}

function getAllMyProfileLinks() {
  // Support multiple instances across desktop/mobile navs
  return Array.from(
    document.querySelectorAll(
      "#nav-my-profile, #my-profile-link, [data-myprofile]",
    ),
  );
}

async function upgradeMyProfileLinks() {
  const links = getAllMyProfileLinks();
  if (!links.length) return;

  const url = await resolveMyProfileUrl();
  if (!url || url === "#") return;

  links.forEach((a) => {
    a.setAttribute("href", url);

    // If your SPA intercepts links, force navigation on click
    const handler = (e) => {
      e.preventDefault();
      location.href = url;
    };

    // Avoid stacking multiple handlers if auth:changed fires repeatedly
    a.removeEventListener("click", a.__myprofileHandler);
    a.addEventListener("click", handler);
    a.__myprofileHandler = handler; // stash for later removal
  });
}

// Initial wire-up and keep fresh on auth changes
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", upgradeMyProfileLinks, {
    once: true,
  });
} else {
  upgradeMyProfileLinks();
}
window.addEventListener("auth:changed", upgradeMyProfileLinks);

// Optional: quick optimistic upgrade from cached user to avoid a flash of '#'
try {
  const cached =
    window.WU_USER || JSON.parse(localStorage.getItem("wuUser") || "null");
  if (cached && cached.handle) {
    const optimisticUrl =
      cached.role === "promoter"
        ? `/p/#${encodeURIComponent(cached.handle)}`
        : `/w/#${encodeURIComponent(cached.handle)}`;
    getAllMyProfileLinks().forEach((a) =>
      a.setAttribute("href", optimisticUrl),
    );
  }
} catch {}
