import { fetchAuthSession } from "/js/auth-bridge.js";

export async function getAuthState() {
  try {
    const s = await fetchAuthSession();
    const id = s?.tokens?.idToken?.toString();
    if (!id) return { signedIn: false, groups: [], role: null, sub: null };
    const payload = JSON.parse(atob(id.split(".")[1]));
    const groups = Array.isArray(payload["cognito:groups"])
      ? payload["cognito:groups"]
      : payload["cognito:groups"]
        ? String(payload["cognito:groups"]).split(/[,\s]+/)
        : [];
    const roleClaim = (payload["custom:role"] || "").toLowerCase();
    const role = roleClaim.startsWith("promo")
      ? "Promoter"
      : roleClaim.startsWith("wrestl")
        ? "Wrestler"
        : null;
    const sub = payload["sub"] || null;
    return { signedIn: true, groups, role, sub };
  } catch {
    return { signedIn: false, groups: [], role: null, sub: null };
  }
}

export const isPromoter = (s) =>
  s.groups?.includes("Promoters") || s.role === "Promoter";
export const isWrestler = (s) =>
  s.groups?.includes("Wrestlers") || s.role === "Wrestler";

export async function applyRoleGatedUI() {
  const s = await getAuthState();
  document.body.dataset.role = s.role || "";
  document.body.dataset.signedin = s.signedIn ? "true" : "false";

  document
    .querySelectorAll('[data-auth="in"]')
    .forEach((el) => (el.style.display = s.signedIn ? "" : "none"));
  document
    .querySelectorAll('[data-auth="out"]')
    .forEach((el) => (el.style.display = s.signedIn ? "none" : ""));

  const showForPromoter = isPromoter(s);
  const showForWrestler = isWrestler(s);
  document
    .querySelectorAll('[data-requires="promoter"]')
    .forEach((el) => (el.style.display = showForPromoter ? "" : "none"));
  document
    .querySelectorAll('[data-requires="wrestler"]')
    .forEach((el) => (el.style.display = showForWrestler ? "" : "none"));

  return s;
}

export async function guardPage({
  requireRole,
  redirect = "index.html",
  replace = null,
} = {}) {
  const s = await getAuthState();
  const ok =
    !requireRole ||
    (requireRole === "Promoter" && isPromoter(s)) ||
    (requireRole === "Wrestler" && isWrestler(s));

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
