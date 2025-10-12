const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["js/roles.js","js/auth-bridge.js"])))=>i.map(i=>d[i]);
import { _ as __vitePreload } from "./core.js";
(async function() {
  async function fetchHTML(url) {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return await res.text();
  }
  function executeScripts(container) {
    const scripts = container.querySelectorAll("script");
    scripts.forEach((old) => {
      const s = document.createElement("script");
      for (const { name, value } of old.attributes) s.setAttribute(name, value);
      s.text = old.text;
      old.parentNode.replaceChild(s, old);
    });
  }
  async function injectPartialsRecursive(root = document) {
    let pass = 0;
    while (true) {
      const nodes = root.querySelectorAll("[data-include]");
      if (nodes.length === 0) break;
      pass++;
      await Promise.all(
        Array.from(nodes).map(async (el) => {
          const url = el.getAttribute("data-include");
          try {
            const html = await fetchHTML(url);
            const wrapper = document.createElement("div");
            wrapper.innerHTML = html;
            el.replaceWith(...Array.from(wrapper.childNodes));
            executeScripts(document);
          } catch (e) {
            console.error("Include failed for", url, e);
          }
        })
      );
      if (pass > 10) {
        console.warn(
          "include.js: stopping after 10 recursive passes to avoid loops"
        );
        break;
      }
    }
  }
  await injectPartialsRecursive();
  window.dispatchEvent(new Event("partials:ready"));
  try {
    const { applyRoleGatedUI } = await __vitePreload(async () => {
      const { applyRoleGatedUI: applyRoleGatedUI2 } = await import("./roles.js");
      return { applyRoleGatedUI: applyRoleGatedUI2 };
    }, true ? __vite__mapDeps([0,1]) : void 0);
    await applyRoleGatedUI();
  } catch (e) {
    console.error("roles.js load/apply failed", e);
  }
  (function highlightNav() {
    const path = location.pathname.split("/").pop() || "index.html";
    document.querySelectorAll(".wu-links a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const targetPath = href.split("#")[0];
      if (targetPath === path) a.classList.add("active");
    });
  })();
  const btn = document.getElementById("nav-toggle");
  const links = document.getElementById("nav-links");
  if (btn && links) {
    btn.addEventListener("click", () => {
      const open = links.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  const y = document.getElementById("year");
  if (y) y.textContent = (/* @__PURE__ */ new Date()).getFullYear();
})();
