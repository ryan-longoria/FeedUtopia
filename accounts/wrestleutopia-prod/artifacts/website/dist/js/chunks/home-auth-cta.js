import { g as getAuthState, b as isWrestler, i as isPromoter } from "./core.js";
function openSignup(intent = "generic") {
  var _a;
  try {
    if ((_a = window.Auth) == null ? void 0 : _a.open) {
      window.Auth.open("signup", { intent });
      return;
    }
    window.dispatchEvent(
      new CustomEvent("auth:open", { detail: { mode: "signup", intent } })
    );
    const loginBtn = document.getElementById("login-btn");
    if (loginBtn) loginBtn.click();
  } catch (e) {
    console.error("openSignup failed", e);
  }
}
document.addEventListener("click", async (e) => {
  var _a, _b, _c, _d;
  const el = e.target.closest("a,button");
  if (!el) return;
  if (el.dataset.auth === "out") {
    e.preventDefault();
    const intent = ((_a = el.id) == null ? void 0 : _a.includes("promoter")) ? "promoter" : ((_b = el.id) == null ? void 0 : _b.includes("talent")) ? "wrestler" : ((_c = el.getAttribute("aria-label")) == null ? void 0 : _c.includes("Promoter")) ? "promoter" : ((_d = el.getAttribute("aria-label")) == null ? void 0 : _d.includes("Talent")) ? "wrestler" : "generic";
    openSignup(intent);
    return;
  }
  if (el.dataset.requires) {
    e.preventDefault();
    try {
      const s = await getAuthState();
      const need = el.dataset.requires;
      const ok = need === "wrestler" && isWrestler(s) || need === "promoter" && isPromoter(s);
      if (!ok) {
        openSignup(need);
      } else {
        window.location.href = el.getAttribute("href") || "#";
      }
    } catch (err) {
      console.error("auth-cta role check failed", err);
      openSignup(el.dataset.requires || "generic");
    }
  }
});
