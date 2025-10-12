(function () {
  const INCLUDE_PREFIX = "/partials/";
  const MAX_PASSES = 10;
  const FETCH_TIMEOUT_MS = 5000;
  const MAX_RETRIES = 2;

  function ensureGateStyle() {
    if (document.getElementById("gate-style")) return;
    const s = document.createElement("style");
    s.id = "gate-style";
    s.textContent = "[data-auth='in'],[data-requires],[data-myprofile],.gated,[data-gated='true']{display:none!important}";
    document.head.appendChild(s);
  }

  function sameOriginUrl(raw) {
    const u = new URL(raw, location.origin);
    if (u.origin !== location.origin) throw new Error(`cross-origin include blocked: ${raw}`);
    if (!u.pathname.startsWith(INCLUDE_PREFIX)) throw new Error(`include path not allowed: ${u.pathname}`);
    return u.toString();
  }

  function withTimeout(promise, ms, controller) {
    const t = setTimeout(() => controller.abort("timeout"), ms);
    return promise.finally(() => clearTimeout(t));
  }

  async function fetchWithRetry(url) {
    let attempt = 0;
    for (;;) {
      const controller = new AbortController();
      try {
        const res = await withTimeout(
          fetch(url, {
            cache: "no-cache",
            credentials: "same-origin",
            referrerPolicy: "same-origin",
            signal: controller.signal
          }),
          FETCH_TIMEOUT_MS,
          controller
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
      } catch (e) {
        attempt++;
        if (attempt > MAX_RETRIES) throw e;
        const backoff = 150 * (1 + Math.random()) * attempt;
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }

  function sanitizeHTMLToFragment(html) {
    const tpl = document.createElement("template");
    tpl.innerHTML = html;
    const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_ELEMENT, null);
    const SAFE_URL_ATTRS = new Set(["href","src"]);
    const SAFE_ATTRS = new Set(["id","class","role","alt","title","rel","target","type","for","value","name","placeholder","width","height"]);
    for (let node = walker.currentNode; node; node = walker.nextNode()) {
      if (!(node instanceof Element)) continue;
      if (node.tagName === "SCRIPT") { node.remove(); continue; }
      for (const attr of Array.from(node.attributes)) {
        const n = attr.name;
        if (n.startsWith("on")) { node.removeAttribute(n); continue; }
        if (n.startsWith("aria-")) continue;
        if (SAFE_URL_ATTRS.has(n)) {
          try {
            const u = new URL(attr.value, location.origin);
            if (u.origin !== location.origin) node.removeAttribute(n);
          } catch { node.removeAttribute(n); }
          continue;
        }
        if (!SAFE_ATTRS.has(n)) node.removeAttribute(n);
      }
    }
    return tpl.content;
  }

  function gateFragment(root) {
    const scope = root instanceof DocumentFragment ? root : document;
    scope.querySelectorAll("[data-auth='in'],[data-requires],[data-myprofile]").forEach(el => {
      el.classList.add("gated");
      el.setAttribute("data-gated","true");
      el.hidden = true;
      el.setAttribute("aria-hidden","true");
    });
    scope.querySelectorAll("[data-auth='out']").forEach(el => {
      el.classList.remove("gated");
      el.removeAttribute("data-gated");
      el.hidden = false;
      el.setAttribute("aria-hidden","false");
    });
  }

  async function injectPartialsRecursive(root = document) {
    let pass = 0;
    while (pass < 10) {
      const nodes = root.querySelectorAll("[data-include]");
      if (nodes.length === 0) break;
      pass++;
      await Promise.all(Array.from(nodes).map(async (el) => {
        const raw = el.getAttribute("data-include");
        let url;
        try { url = sameOriginUrl(raw); } catch (e) { el.replaceWith(fallbackBox(`Include blocked: ${raw}`)); return; }
        try {
          const html = await fetchWithRetry(url);
          const frag = sanitizeHTMLToFragment(html);
          gateFragment(frag);
          el.replaceWith(frag);
        } catch (e) {
          el.replaceWith(fallbackBox(`Failed to load: ${url}`));
        }
      }));
    }
  }

  function fallbackBox(text) {
    const d = document.createElement("div");
    d.setAttribute("role","status");
    d.className = "include-fallback muted";
    d.textContent = text;
    return d;
  }

  (async () => {
    ensureGateStyle();
    gateFragment(document);
    await injectPartialsRecursive();
    if (document.getElementById("auth-modal")) {
      await import("/js/auth-modal.js");
    }
    window.__partialsReady = true;
    window.dispatchEvent(new Event("partials:ready"));
    try {
      const { applyRoleGatedUI } = await import("/js/roles.js");
      await applyRoleGatedUI();
    } catch {}
    try {
      if (document.getElementById("auth-modal")) {
        await import("/js/auth-modal.js");
      }
    } catch {}
    (() => {
      const here = new URL(location.href);
      document.querySelectorAll(".wu-links a[href]").forEach((a) => {
        const target = new URL(a.getAttribute("href"), location.origin);
        const np = (p) => p.endsWith("/") ? p + "index.html" : p;
        if (np(target.pathname) === np(here.pathname)) {
          a.classList.add("active");
          a.setAttribute("aria-current","page");
        }
      });
    })();
    const btn = document.getElementById("nav-toggle");
    const links = document.getElementById("nav-links");
    if (btn && links) {
      btn.addEventListener("click", () => {
        const open = links.classList.toggle("open");
        btn.setAttribute("aria-expanded", String(open));
        if (open) links.querySelector("a,button")?.focus?.();
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && links.classList.contains("open")) {
          links.classList.remove("open");
          btn.setAttribute("aria-expanded","false");
          btn.focus();
        }
      });
    }
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
  })();
})();
