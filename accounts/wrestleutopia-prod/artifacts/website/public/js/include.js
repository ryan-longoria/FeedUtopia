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
      const [m] = performance.getEntriesByName(label).slice(-1);
      console.info(`[include.js] ${label} ${m?.duration?.toFixed?.(1) ?? "?"}ms`);
    },
  };

  function sameOriginUrl(raw) {
    const u = new URL(raw, location.origin);
    if (u.origin !== location.origin) throw new Error(`cross-origin include blocked: ${raw}`);
    if (!u.pathname.startsWith(INCLUDE_PREFIX)) {
      throw new Error(`include path not allowed: ${u.pathname}`);
    }
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
          controller,
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

    const walker = document.createTreeWalker(
      tpl.content,
      NodeFilter.SHOW_ELEMENT,
      null
    );

    const SAFE_URL_ATTRS = new Set(["href", "src"]);
    const SAFE_ATTRS = new Set([
      "id", "class", "role", "alt", "title", "rel", "target", "type",
      "for", "value", "name", "placeholder", "width", "height"
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

        if (!SAFE_ATTRS.has(n)) {
          node.removeAttribute(n);
        }
      }
    }

    return tpl.content;
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
            el.replaceWith(frag);
          } catch (e) {
            console.error("[include.js] include failed", { url, error: String(e) });
            el.replaceWith(fallbackBox(`Failed to load: ${url}`));
            try {
              navigator.sendBeacon?.("/api/telemetry", JSON.stringify({
                type: "include_error", url, error: String(e)
              }));
            } catch {}
          }
        }),
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