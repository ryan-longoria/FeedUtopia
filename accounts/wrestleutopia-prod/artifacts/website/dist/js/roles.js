import "./auth-bridge.js";
import { fetchAuthSession } from "https://esm.sh/aws-amplify@6/auth";
import "https://esm.sh/aws-amplify@6";
import "https://esm.sh/aws-amplify@6/utils";
async function getAuthState() {
  var _a, _b;
  try {
    const s = await fetchAuthSession();
    const id = (_b = (_a = s == null ? void 0 : s.tokens) == null ? void 0 : _a.idToken) == null ? void 0 : _b.toString();
    if (!id) return { signedIn: false, groups: [], role: null, sub: null };
    const payload = JSON.parse(atob(id.split(".")[1]));
    const groups = Array.isArray(payload["cognito:groups"]) ? payload["cognito:groups"] : payload["cognito:groups"] ? String(payload["cognito:groups"]).split(/[,\s]+/) : [];
    const roleClaim = (payload["custom:role"] || "").toLowerCase();
    const role = roleClaim.startsWith("promo") ? "Promoter" : roleClaim.startsWith("wrestl") ? "Wrestler" : null;
    const sub = payload["sub"] || null;
    return { signedIn: true, groups, role, sub };
  } catch {
    return { signedIn: false, groups: [], role: null, sub: null };
  }
}
const isPromoter = (s) => {
  var _a;
  return ((_a = s.groups) == null ? void 0 : _a.includes("Promoters")) || s.role === "Promoter";
};
const isWrestler = (s) => {
  var _a;
  return ((_a = s.groups) == null ? void 0 : _a.includes("Wrestlers")) || s.role === "Wrestler";
};
async function applyRoleGatedUI() {
  const s = await getAuthState();
  document.body.dataset.role = s.role || "";
  document.body.dataset.signedin = s.signedIn ? "true" : "false";
  document.querySelectorAll('[data-auth="in"]').forEach((el) => el.style.display = s.signedIn ? "" : "none");
  document.querySelectorAll('[data-auth="out"]').forEach((el) => el.style.display = s.signedIn ? "none" : "");
  const showForPromoter = isPromoter(s);
  const showForWrestler = isWrestler(s);
  document.querySelectorAll('[data-requires="promoter"]').forEach((el) => el.style.display = showForPromoter ? "" : "none");
  document.querySelectorAll('[data-requires="wrestler"]').forEach((el) => el.style.display = showForWrestler ? "" : "none");
  return s;
}
async function guardPage({
  requireRole,
  redirect = "index.html",
  replace = null
} = {}) {
  const s = await getAuthState();
  const ok = !requireRole || requireRole === "Promoter" && isPromoter(s) || requireRole === "Wrestler" && isWrestler(s);
  if (ok) return s;
  if (replace) {
    const target = document.querySelector(replace);
    if (target)
      target.innerHTML = `<p class="muted">Not authorized for this section.</p>`;
    return s;
  }
  location.href = redirect;
  return s;
}
(async () => {
  const s = await getAuthState();
  if (isPromoter(s) || isWrestler(s)) {
    document.body.classList.add("authenticated");
  }
})();
export {
  applyRoleGatedUI,
  getAuthState,
  guardPage,
  isPromoter,
  isWrestler
};
