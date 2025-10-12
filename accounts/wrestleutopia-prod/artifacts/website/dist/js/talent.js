import { g as getAuthState, i as isPromoter } from "../assets/core-DtKmO-aM.js";
import "../assets/home-auth-cta-CKuosgkk.js";
import "https://esm.sh/aws-amplify@6";
import "https://esm.sh/aws-amplify@6/auth";
import "https://esm.sh/aws-amplify@6/utils";
const run$1 = async () => {
  try {
    const s = await getAuthState();
    if (isPromoter(s)) return;
    const sec = document.querySelector("#search");
    if (!sec) return;
    sec.innerHTML = `
      <h2>Talent Search <span class="badge">Locked</span></h2>
      <div class="mt-2">
        <p class="muted">Only promoters can search wrestler profiles.</p>
        <a href="#" class="btn small" data-auth="out" id="become-promoter">Create a free promoter account</a>
      </div>
    `;
  } catch (e) {
    console.error("talent-lock failed", e);
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run$1, { once: true });
} else {
  run$1();
}
const run = () => {
  const dlg = document.getElementById("wrestler-modal");
  const closeBtn = document.getElementById("wm-close");
  if (dlg && closeBtn) {
    closeBtn.addEventListener("click", () => dlg.close());
  }
};
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run, { once: true });
} else {
  run();
}
