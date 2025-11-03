import { fetchAuthSession } from "/js/auth-bridge.js";

const CFG = {
  cacheTtlMs: 30 * 1000,
};

const nowSec = () => Math.floor(Date.now() / 1000);
const freeze = (o) => Object.freeze(o);

function parseJwtPayload(idToken) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}

const EMPTY_STATE = freeze({ signedIn: false, groups: [], role: null, sub: null });

let _memo = { until: 0, state: EMPTY_STATE };
let _inflight = null;

async function _resolveAuthState() {
  try {
    const s = await fetchAuthSession();
    const id = s?.tokens?.idToken?.toString();
    if (!id) return EMPTY_STATE;

    const payload = parseJwtPayload(id);
    if (!payload) return EMPTY_STATE;

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

    return freeze({ signedIn: true, groups, role, sub });
  } catch {
    return EMPTY_STATE;
  }
}

export async function getAuthState() {
  const now = Date.now();
  if (now < _memo.until) return _memo.state;
  if (_inflight) return _inflight;

  _inflight = (async () => {
    const state = await _resolveAuthState();
    _memo = { until: now + CFG.cacheTtlMs, state };
    _inflight = null;
    return state;
  })();

  return _inflight;
}

export const isPromoter = (s) =>
  s.groups?.includes("Promoters") || s.role === "Promoter";
export const isWrestler = (s) =>
  s.groups?.includes("Wrestlers") || s.role === "Wrestler";

export async function applyRoleGatedUI() {
  if (!document.getElementById("gate-style")) {
    const style = document.createElement("style");
    style.id = "gate-style";
    style.textContent = `[data-auth="in"],[data-requires],[data-myprofile]{display:none!important;}`;
    document.head.appendChild(style);
  }

  const state = await getAuthState();
  const signedIn = !!state.signedIn;
  const role = (state.role || "").toString().trim().toLowerCase();

  document.body.dataset.signedin = String(signedIn);
  document.body.dataset.role = role || "";

  const show = (el) => {
    if (!el) return;
    el.classList.remove("gated");
    el.hidden = false;
    el.style.removeProperty("display");
  };
  const hide = (el) => {
    if (!el) return;
    el.classList.add("gated");
    el.hidden = true;
    el.style.display = "none";
  };

  document.querySelectorAll('[data-auth="out"]').forEach((el) =>
    signedIn ? hide(el) : show(el),
  );
  document.querySelectorAll('[data-auth="in"]').forEach((el) =>
    signedIn ? show(el) : hide(el),
  );

  document.querySelectorAll("[data-requires]").forEach((el) => {
    const req = (el.getAttribute("data-requires") || "").toLowerCase();
    const ok = signedIn && req.split(/[\s,]+/).filter(Boolean).includes(role);
    ok ? show(el) : hide(el);
  });

  document.querySelectorAll("[data-myprofile]").forEach((el) =>
    signedIn ? show(el) : hide(el),
  );

  document.getElementById("gate-style")?.remove();

  document.dispatchEvent(new CustomEvent("auth:change", { detail: freeze({ ...state }) }));
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

  try {
    const u = new URL(redirect, location.origin);
    if (u.origin === location.origin && /^\/[A-Za-z0-9/_\-.]*$/.test(u.pathname)) {
      location.replace(u.pathname + u.search + u.hash);
    } else {
      location.replace("/index.html");
    }
  } catch {
    location.replace("/index.html");
  }
  return s;
}

(async () => {
  const s = await getAuthState();
  if (isPromoter(s) || isWrestler(s)) {
    document.body.classList.add("authenticated");
  } else {
    document.body.classList.remove("authenticated");
  }
})();
