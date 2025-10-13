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
  const state = await getAuthState?.();
  const signedIn = !!state?.signedIn;
  const role = (state?.role || "").toString().trim().toLowerCase();

  document.body.dataset.signedin = String(signedIn);
  document.body.dataset.role = role || "";

  const show = (el) => {
    if (!el) return;
    el.hidden = false;
    el.removeAttribute("aria-hidden");
    // reset any inline display we might have set earlier
    if (el.style && el.style.display === "none") el.style.display = "";
  };

  const hide = (el) => {
    if (!el) return;
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    if (el.style) el.style.display = "none";
  };

  // Auth-gated wrappers and items
  document.querySelectorAll('[data-auth="out"]').forEach(el => signedIn ? hide(el) : show(el));
  document.querySelectorAll('[data-auth="in"]').forEach(el => signedIn ? show(el) : hide(el));

  // Role-gated items
  const requiresSel = '[data-requires]';
  document.querySelectorAll(requiresSel).forEach(el => {
    const req = (el.getAttribute("data-requires") || "").toLowerCase();
    // allow comma/space separated lists e.g. "wrestler promoter"
    const tokens = req.split(/[\s,]+/).filter(Boolean);
    const ok = signedIn && (tokens.length === 0 || tokens.includes(role));
    ok ? show(el) : hide(el);
  });

  // My profile visibility follows signed-in
  document.querySelectorAll("[data-myprofile]").forEach(el => signedIn ? show(el) : hide(el));
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
