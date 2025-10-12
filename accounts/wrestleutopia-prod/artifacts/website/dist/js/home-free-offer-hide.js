import { getAuthState, isPromoter, isWrestler } from "/js/roles.js";

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
