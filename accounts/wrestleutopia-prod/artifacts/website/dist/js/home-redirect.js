import { getAuthState, isPromoter, isWrestler } from "./roles.js";
import "./auth-bridge.js";
import "https://esm.sh/aws-amplify@6";
import "https://esm.sh/aws-amplify@6/auth";
import "https://esm.sh/aws-amplify@6/utils";
(async () => {
  try {
    const isHome = /^(\/|\/index\.html)$/.test(location.pathname);
    if (!isHome) return;
    const s = await getAuthState();
    if (!s) return;
    if (isPromoter(s)) {
      location.replace("/dashboard_promoter.html");
      return;
    }
    if (isWrestler(s)) {
      location.replace("/dashboard_wrestler.html");
      return;
    }
  } catch (e) {
    console.error("home-redirect failed", e);
  }
})();
