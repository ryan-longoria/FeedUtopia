// js/include.js
(async function(){
  async function injectPartials(){
    const nodes = document.querySelectorAll('[data-include]');
    await Promise.all(Array.from(nodes).map(async el => {
      const url = el.getAttribute('data-include');
      try{
        const res = await fetch(url, {cache:'no-cache'});
        const html = await res.text();
        el.outerHTML = html; // replace placeholder with fetched HTML
      }catch(e){
        console.error('Include failed for', url, e);
      }
    }));
  }

  // Wait for partials, then do page wiring
  await injectPartials();

  // Active nav highlighting
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a=>{
    if(a.getAttribute('href') === path) a.classList.add('active');
  });

  // Mobile menu toggle
  const btn = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  if(btn && links){
    btn.addEventListener('click', ()=>{
      const open = links.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Footer year
  const y = document.getElementById('year');
  if(y){ y.textContent = new Date().getFullYear(); }
})();
