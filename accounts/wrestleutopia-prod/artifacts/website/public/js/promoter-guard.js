import { getAuthState, isPromoter } from "/js/roles.js";

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
