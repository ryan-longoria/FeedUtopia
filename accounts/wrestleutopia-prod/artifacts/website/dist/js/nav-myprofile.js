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
    // Signed-in wrestler but no handle yet—send to dashboard
    return "/dashboard_wrestler.html";
  }

  if (isPromoter(state)) {
    try {
      const me = await apiFetch("/profiles/promoters/me");
      const id = me?.handle || me?.id || me?.sub || state.sub;
      if (id) return toHashUrl("p", id);
    } catch {}
    if (state.sub) return toHashUrl("p", state.sub);
    // Signed-in promoter but no handle—send to dashboard
    return "/dashboard_promoter.html";
  }

  // Unknown role or not signed in
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

  // Always attach a resilient click handler that resolves at click time.
  links.forEach((a) => {
    const fallback = a.getAttribute("data-fallback") || "/profile.html";

    const clickHandler = async (e) => {
      // Intercept to compute latest destination just-in-time
      e.preventDefault();
      let url = "#";
      try {
        url = await resolveMyProfileUrl();
      } catch {}

      if (url && url !== "#") {
        // Set href once so middle-click/open-in-new-tab work subsequently
        a.setAttribute("href", url);
        location.href = url;
      } else {
        // Deterministic, always-valid fallback
        a.setAttribute("href", fallback);
        location.href = fallback;
      }
    };

    a.removeEventListener("click", a.__myprofileHandler);
    a.addEventListener("click", clickHandler);
    a.__myprofileHandler = clickHandler;
  });

  // Opportunistically pre-set href once we have a resolved URL (helps hover previews)
  try {
    const resolved = await resolveMyProfileUrl();
    if (resolved && resolved !== "#") {
      links.forEach((a) => a.setAttribute("href", resolved));
    }
  } catch {}
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", upgradeMyProfileLinks, { once: true });
} else {
  upgradeMyProfileLinks();
}
window.addEventListener("auth:changed", upgradeMyProfileLinks);

// Optimistic first paint: if we have cached user with handle, set an initial href
try {
  const cached = window.WU_USER || JSON.parse(localStorage.getItem("wuUser") || "null");
  if (cached?.handle) {
    const optimistic =
      cached.role === "promoter"
        ? toHashUrl("p", cached.handle)
        : toHashUrl("w", cached.handle);
    getAllMyProfileLinks().forEach((a) => a.setAttribute("href", optimistic));
  } else {
    // Ensure a safe fallback early if no cache present
    getAllMyProfileLinks().forEach((a) => {
      if (!a.getAttribute("href") || a.getAttribute("href") === "#") {
        a.setAttribute("href", a.getAttribute("data-fallback") || "/profile.html");
      }
    });
  }
} catch {}