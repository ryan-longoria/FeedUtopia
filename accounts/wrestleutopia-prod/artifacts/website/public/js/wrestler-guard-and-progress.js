import { getAuthState, isWrestler } from "/js/roles.js";

(async () => {
  try {
    const state = await getAuthState();
    if (!isWrestler(state)) {
      location.replace("/index.html");
    }
  } catch {
    location.replace("/index.html");
  }
})();