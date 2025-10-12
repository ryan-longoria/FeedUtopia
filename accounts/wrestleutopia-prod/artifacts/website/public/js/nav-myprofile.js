// public/js/nav-myprofile.js
// Works even if the nav is injected later via include.js

// --- Role resolution (be defensive & fast) ---
async function getRole() {
  // 1) quick cache/localStorage (if you store it)
  try {
    const cached = localStorage.getItem("wu.role");
    if (cached) return cached;
  } catch {}

  // 2) try roles.js if it exists
  try {
    const mod = await import(/* @vite-ignore */ "/js/roles.js");
    if (typeof mod.getMyRole === "function") {
      const r = await mod.getMyRole();
      if (r) {
        try { localStorage.setItem("wu.role", r); } catch {}
        return r;
      }
    }
  } catch {
    // roles.js missing or errored; ignore
  }

  // 3) unknown
  return null;
}

function resolveMyProfileHref(role) {
  // adjust to your actual pages
  if (role === "promoter") return "/promoter/index.html";
  // default: wrestler profile
  return "/profile.html";
}

function isMyProfileEl(el) {
  if (!el || el.nodeType !== 1) return false;
  if (el.id === "nav-myprofile") return true;
  if (el.matches?.('a[data-action="my-profile"]')) return true;
  if (el.matches?.('a[href="#my-profile"]')) return true;
  return false;
}

async function enhanceLinks() {
  const role = await getRole();
  const href = resolveMyProfileHref(role);
  document.querySelectorAll(
    '#nav-myprofile, a[data-action="my-profile"], a[href="#my-profile"]'
  ).forEach((a) => {
    try {
      a.setAttribute("href", href);
      a.setAttribute("data-enhanced", "true");
    } catch {}
  });
}

// Delegated click so it works even if the nav arrives later
document.addEventListener("click", async (e) => {
  const a = e.target.closest?.('a');
  if (!isMyProfileEl(a)) return;

  e.preventDefault();
  try {
    // ensure we set a final href and go
    const role = await getRole();
    const href = resolveMyProfileHref(role);
    a?.setAttribute("href", href);
    location.href = href;
  } catch (err) {
    console.error("[nav-myprofile] failed, falling back to /profile.html", err);
    location.href = "/profile.html";
  }
});

// Run once after DOM ready to set real hrefs (progressive enhancement)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", enhanceLinks, { once: true });
} else {
  enhanceLinks();
}
