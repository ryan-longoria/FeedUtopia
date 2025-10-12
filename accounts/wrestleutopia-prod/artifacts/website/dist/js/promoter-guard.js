import { getAuthState, isPromoter } from "./roles.js";
import "./auth-bridge.js";
import "https://esm.sh/aws-amplify@6";
import "https://esm.sh/aws-amplify@6/auth";
import "https://esm.sh/aws-amplify@6/utils";
const run = async () => {
  try {
    const s = await getAuthState();
    if (!isPromoter(s)) {
      location.replace("index.html");
    }
  } catch (e) {
    console.error("promoter-guard failed", e);
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run, { once: true });
} else {
  run();
}
