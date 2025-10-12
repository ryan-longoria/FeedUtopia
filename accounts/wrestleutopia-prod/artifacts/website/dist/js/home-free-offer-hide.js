import { g as getAuthState, i as isPromoter, c as isWrestler } from "./core.js";
import "https://esm.sh/aws-amplify@6";
import "https://esm.sh/aws-amplify@6/auth";
import "https://esm.sh/aws-amplify@6/utils";
const run = async () => {
  try {
    const s = await getAuthState();
    if (isPromoter(s) || isWrestler(s)) {
      const el = document.getElementById("free-offer");
      if (el) el.remove();
    }
  } catch (e) {
    console.error("home-free-offer-hide failed", e);
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run, { once: true });
} else {
  run();
}
