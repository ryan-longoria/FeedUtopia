import { g as getAuthState, c as isWrestler } from "./core.js";
import "https://esm.sh/aws-amplify@6";
import "https://esm.sh/aws-amplify@6/auth";
import "https://esm.sh/aws-amplify@6/utils";
const run = async () => {
  try {
    const s = await getAuthState();
    if (!isWrestler(s)) {
      location.replace("index.html");
      return;
    }
    const pct = 60;
    const bar = document.getElementById("profile-pct");
    const label = document.getElementById("profile-pct-label");
    if (bar) bar.style.width = pct + "%";
    if (label) label.textContent = pct + "% complete";
  } catch (e) {
    console.error("wrestler-guard-and-progress failed", e);
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run, { once: true });
} else {
  run();
}
