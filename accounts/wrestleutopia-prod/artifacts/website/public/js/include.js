// js/include.js
(async function () {
  async function fetchHTML(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    return await res.text();
  }

  function executeScripts(container) {
    // Reinsert <script> tags so the browser executes them
    const scripts = container.querySelectorAll('script');
    scripts.forEach((old) => {
      const s = document.createElement('script');
      // copy attrs
      for (const { name, value } of old.attributes) s.setAttribute(name, value);
      // copy inline JS
      s.text = old.text;
      // replace
      old.parentNode.replaceChild(s, old);
    });
  }

  async function injectPartialsRecursive(root = document) {
    // Keep resolving until there are no data-include elements left
    let pass = 0;
    while (true) {
      const nodes = root.querySelectorAll('[data-include]');
      if (nodes.length === 0) break;
      pass++;
      await Promise.all(
        Array.from(nodes).map(async (el) => {
          const url = el.getAttribute('data-include');
          try {
            const html = await fetchHTML(url);
            // Create a wrapper to parse
            const wrapper = document.createElement('div');
            wrapper.innerHTML = html;

            // Replace placeholder
            el.replaceWith(...Array.from(wrapper.childNodes));

            // Execute any scripts from the fetched HTML
            executeScripts(document);
          } catch (e) {
            console.error('Include failed for', url, e);
          }
        })
      );
      // loop again in case the included HTML had more data-include nodes
      if (pass > 10) {
        console.warn('include.js: stopping after 10 recursive passes to avoid loops');
        break;
      }
    }
  }

  // Run includes first
  await injectPartialsRecursive();

  // Apply role-gated UI *after* partials are in the DOM
  try {
    const { applyRoleGatedUI } = await import('/js/roles.js');
    await applyRoleGatedUI();
  } catch (e) {
    console.error('roles.js load/apply failed', e);
  }

  // Active nav highlighting: match by file (ignore hash)
  (function highlightNav() {
    const path = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.wu-links a').forEach((a) => {
      const href = a.getAttribute('href') || '';
      const targetPath = href.split('#')[0];
      if (targetPath === path) a.classList.add('active');
    });
  })();

  // Mobile menu toggle (unchanged)
  const btn = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  if (btn && links) {
    btn.addEventListener('click', () => {
      const open = links.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Footer year (unchanged)
  const y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();
})();