import { apiFetch } from "/js/api.js";
import { getAuthState, isWrestler, isPromoter } from "/js/roles.js";

function toHashUrl(kind, slug) {
  // kind: "w" | "p"
  if (!slug) return "#";
  return `/${kind}/#${encodeURIComponent(slug)}`;
}

async function resolveMyProfileUrl() {
  const state = await getAuthState();
  if (!state) return "#";

  if (isWrestler(state)) {
    try {
      const me = await apiFetch("/profiles/wrestlers/me");
      if (me?.handle) return toHashUrl("w", me.handle);
    } catch {}
    return "/dashboard_wrestler.html";
  }

  if (isPromoter(state)) {
    try {
      const me = await apiFetch("/profiles/promoters/me");
      const id = me?.handle || me?.id || me?.sub || state.sub;
      if (id) return toHashUrl("p", id);
    } catch {}
    if (state.sub) return toHashUrl("p", state.sub);
    return "/dashboard_promoter.html";
  }

  return "#";
}

function getAllMyProfileLinks() {
  return Array.from(
    document.querySelectorAll("#nav-my-profile, #my-profile-link, [data-myprofile]")
  );
}

async function upgradeMyProfileLinks() {
  const links = getAllMyProfileLinks();
  if (!links.length) return;

  const url = await resolveMyProfileUrl();
  if (!url || url === "#") return;

  links.forEach((a) => {
    a.setAttribute("href", url);

    const handler = (e) => {
      // Only intercept if we're sending to hash URL; allow normal links otherwise
      if (url.startsWith("/w/#") || url.startsWith("/p/#")) {
        e.preventDefault();
        location.href = url;
      }
    };

    a.removeEventListener("click", a.__myprofileHandler);
    a.addEventListener("click", handler);
    a.__myprofileHandler = handler;
  });

}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", upgradeMyProfileLinks, { once: true });
} else {
  upgradeMyProfileLinks();
}
window.addEventListener("auth:changed", upgradeMyProfileLinks);

try {
  const cached = window.WU_USER || JSON.parse(localStorage.getItem("wuUser") || "null");
  if (cached?.handle) {
    const optimistic = cached.role === "promoter"
      ? toHashUrl("p", cached.handle)
      : toHashUrl("w", cached.handle);
    getAllMyProfileLinks().forEach((a) => a.setAttribute("href", optimistic));
  }
} catch {}
