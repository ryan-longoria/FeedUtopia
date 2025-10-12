(function () {
  const INCLUDE_PREFIX = "/partials/";
  const MAX_PASSES = 10;
  const FETCH_TIMEOUT_MS = 5000;
  const MAX_RETRIES = 2;

  const perf = {
    start(label) { performance.mark(label + ":start"); },
    end(label) {
      performance.mark(label + ":end");
      performance.measure(label, label + ":start", label + ":end");
      const entries = performance.getEntriesByName(label);
      const m = entries[entries.length - 1];
      console.info(`[include.js] ${label} ${m?.duration?.toFixed?.(1) ?? "?"}ms`);
    },
  };

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
            signal: controller.signal,
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
    const SAFE_URL_ATTRS = new Set(["href", "src"]);
    const SAFE_ATTRS = new Set([
      "id","class","role","alt","title","rel","target","type",
      "for","value","name","placeholder","width","height"
    ]);
    for (let node = walker.currentNode; node; node = walker.nextNode()) {
      if (!(node instanceof Element)) continue;
      if (node.tagName === "SCRIPT") {
        node.remove();
        continue;
      }
      for (const attr of Array.from(node.attributes)) {
        const n = attr.name;
        if (n.startsWith("on")) {
          node.removeAttribute(n);
          continue;
        }
        if (n.startsWith("aria-")) continue;
        if (SAFE_URL_ATTRS.has(n)) {
          try {
            const u = new URL(attr.value, location.origin);
            if (u.origin !== location.origin) node.removeAttribute(n);
          } catch {
            node.removeAttribute(n);
          }
          continue;
        }
        if (!SAFE_ATTRS.has(n)) node.removeAttribute(n);
      }
    }
    return tpl.content;
  }

  function preHideAuthGated(fragmentOrRoot) {
    const root = fragmentOrRoot instanceof DocumentFragment ? fragmentOrRoot : document;
    root.querySelectorAll('[data-auth], [data-requires], [data-role], [data-myprofile]').forEach(el => {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
    });
  }

  function syncHiddenWithDisplay() {
    document.querySelectorAll('[data-auth], [data-requires]').forEach(el => {
      const visible = el.style.display !== 'none';
      el.hidden = !visible;
      el.setAttribute('aria-hidden', String(!visible));
    });
    const signedIn = document.body?.dataset?.signedin === "true";
    document.querySelectorAll('[data-myprofile]').forEach(el => {
      el.hidden = !signedIn;
      el.setAttribute('aria-hidden', String(!signedIn));
    });
  }

  async function injectPartialsRecursive(root = document) {
    perf.start("partials-total");
    let pass = 0;
    const visited = new Set();
    while (pass < MAX_PASSES) {
      const nodes = root.querySelectorAll("[data-include]");
      if (nodes.length === 0) break;
      pass++;
      await Promise.all(
        Array.from(nodes).map(async (el) => {
          const raw = el.getAttribute("data-include");
          const signature = `${pass}:${raw}:${Math.random().toString(36).slice(2)}`;
          if (visited.has(signature)) return;
          visited.add(signature);
          let url;
          try {
            url = sameOriginUrl(raw);
          } catch (e) {
            console.error("[include.js] blocked include", raw, e.message);
            el.replaceWith(fallbackBox(`Include blocked: ${raw}`));
            return;
          }
          try {
            const html = await fetchWithRetry(url);
            const frag = sanitizeHTMLToFragment(html);
            preHideAuthGated(frag);
            el.replaceWith(frag);
          } catch (e) {
            console.error("[include.js] include failed", { url, error: String(e) });
            el.replaceWith(fallbackBox(`Failed to load: ${url}`));
          }
        })
      );
    }
    if (pass === MAX_PASSES) {
      console.warn("[include.js] stopped after max passes, possible include loop");
    }
    perf.end("partials-total");
  }

  function fallbackBox(text) {
    const d = document.createElement("div");
    d.setAttribute("role", "status");
    d.className = "include-fallback muted";
    d.textContent = text;
    return d;
  }

  async function wireAuthButtons() {
    const dlg = document.getElementById("auth-modal");
    const loginBtn = document.getElementById("login-btn");
    const logoutBtn = document.getElementById("logout-btn");
    if (loginBtn && dlg?.showModal) {
      loginBtn.addEventListener("click", (e) => {
        e.preventDefault();
        try { dlg.showModal(); } catch {}
      });
    }
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          const m = await import("/js/auth-bridge.js");
          await m.signOut();
          location.href = "/index.html";
        } catch (err) {
          console.error("[auth] signOut error", err);
        }
      });
    }
  }

  (async () => {
    await injectPartialsRecursive();
    window.__partialsReady = true;
    window.dispatchEvent(new Event("partials:ready"));
    try {
      const { applyRoleGatedUI } = await import("/js/roles.js");
      await applyRoleGatedUI();
    } catch (e) {
      console.error("[include.js] roles.js load/apply failed", e);
    }
    syncHiddenWithDisplay();
    await wireAuthButtons();
    (() => {
      const here = new URL(location.href);
      document.querySelectorAll(".wu-links a[href]").forEach((a) => {
        const target = new URL(a.getAttribute("href"), location.origin);
        if (normalizePath(target.pathname) === normalizePath(here.pathname)) {
          a.classList.add("active");
          a.setAttribute("aria-current", "page");
        }
      });
      function normalizePath(p) {
        return p.endsWith("/") ? p + "index.html" : p;
      }
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
          btn.setAttribute("aria-expanded", "false");
          btn.focus();
        }
      });
    }
    const y = document.getElementById("year");
    if (y) y.textContent = new Date().getFullYear();
  })();
})();
