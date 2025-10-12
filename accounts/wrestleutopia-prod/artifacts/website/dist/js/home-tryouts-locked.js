import { getAuthState, isPromoter, isWrestler } from "./roles.js";
import "./auth-bridge.js";
import "https://esm.sh/aws-amplify@6";
import "https://esm.sh/aws-amplify@6/auth";
import "https://esm.sh/aws-amplify@6/utils";
const renderLocked = () => `
  <div class="card locked-card wrestler-only">
    <div class="profile blurred">
      <img src="https://picsum.photos/seed/tryoutlock${Math.floor(Math.random() * 9999)}/200/200" alt="Locked tryout" width="200" height="200" loading="lazy"/>
      <div class="info">
        <div><strong>— — —</strong> <span class="muted">(— — —)</span></div>
        <div class="mt-2">— — • —/—/— • —, —</div>
        <p class="mt-2 muted">Full details and one-click apply are available to wrestlers.</p>
        <a class="btn small mt-3" href="#" data-auth="out">Create free wrestler account</a>
      </div>
    </div>
  </div>
`;
const run = async () => {
  try {
    const s = await getAuthState();
    if (isPromoter(s) || isWrestler(s)) return;
    const grid = document.querySelector("#home-tryouts");
    if (!grid) return;
    grid.innerHTML = renderLocked() + renderLocked() + renderLocked();
  } catch (e) {
    console.error("home-tryouts-locked failed", e);
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run, { once: true });
} else {
  run();
}
