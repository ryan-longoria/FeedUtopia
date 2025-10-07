import { getAuthState, isPromoter, isWrestler } from "/js/roles.js";

(async () => {
  try {
    const s = await getAuthState();
    if (isPromoter(s)) location.replace("dashboard_promoter.html");
    if (isWrestler(s)) location.replace("dashboard_wrestler.html");
  } catch (e) {
    console.error("home-redirect failed", e);
  }
})();
