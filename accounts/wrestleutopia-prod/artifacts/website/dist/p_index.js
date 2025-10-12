import{a as b}from"./chunks/core-DMEOCLyK.js";import{m}from"./chunks/media-zB9oTFcx.js";import"https://esm.sh/aws-amplify@6";import"https://esm.sh/aws-amplify@6/auth";import"https://esm.sh/aws-amplify@6/utils";const o=e=>String(e??"").replace(/[&<>"]/g,t=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[t]),w=e=>/^public\/promoters\/profiles\//.test(String(e))||/^profiles\//.test(String(e));function l(e,t){const a=String(e||"").trim();if(!a)return"";try{const i=new URL(a,location.origin);if(!/^https?:$/.test(i.protocol))return""}catch{return""}return`<a href="${o(a)}" target="_blank" rel="noopener nofollow">${o(t||a)}</a>`}function L(e){const t=e&&typeof e=="object"?e:{};return[t.website&&l(t.website,"Website"),t.twitter&&l(t.twitter,"Twitter"),t.instagram&&l(t.instagram,"Instagram"),t.tiktok&&l(t.tiktok,"TikTok"),t.youtube&&l(t.youtube,"YouTube"),t.facebook&&l(t.facebook,"Facebook")].filter(Boolean).join(" • ")}function P(e){try{const t=new Date(e);return isNaN(t)?"":t.toLocaleDateString(void 0,{year:"numeric",month:"short",day:"numeric"})}catch{return""}}function T(e){return!Array.isArray(e)||!e.length?'<p class="muted">No open tryouts.</p>':`
    <div class="grid cols-2 mt-2">
      ${e.map(t=>{const a=t.date?P(t.date):"",i=o(t.requirements||""),d=o(t.city||""),u=o(t.orgName||"Tryout"),v=o((t.status||"open").toUpperCase()),p=o(t.tryoutId||"");return`
          <div class="card">
            <div class="badge">${v}</div>
            <h3 style="margin:6px 0 2px">${u}</h3>
            <div class="muted">${d}${a?` • ${a}`:""}</div>
            ${i?`<p class="mt-2">${i}</p>`:""}
            <a class="btn small mt-2" href="/tryouts.html#${p}">View</a>
          </div>`}).join("")}
    </div>`}function K(e={}){const t=[e.street1,e.street2,e.city,e.region,e.postalCode,e.country].filter(Boolean).join(", ");return e.address?String(e.address):t}function B(){const e=new URL(location.href),a=(e.pathname.split("/").filter(Boolean)[1]||"").trim(),i=(e.hash||"").replace(/^#/,"");return a||i||""}function C(e,t,a=[]){if(!e)return;if(!(t!=null&&t.userId)){e.innerHTML='<p class="muted">Promotion not found.</p>';return}const i=o(t.orgName||"Promotion"),d=t.logoKey?m(t.logoKey):"/assets/avatar-fallback.svg",u=t.coverKey?m(t.coverKey):"",v=t.logoKey&&w(t.logoKey)?`${d}?v=${Date.now()}`:d,p=t.coverKey?w(t.coverKey)?`${u}?v=${Date.now()}`:u:"",g=o(K(t)),f=L({...t.website?{website:t.website}:{},...t.socials||{}}),y=["about","photos","videos","tryouts"];Array.isArray(t.rosterHandles)&&t.rosterHandles.length&&y.push("roster");const k=y.map((s,r)=>{const n=s[0].toUpperCase()+s.slice(1);return`<a href="#${s}" ${r===0?'aria-current="page"':""}>${n}</a>`}).join("");e.innerHTML=`
    <section class="hero card" style="max-width:980px;margin-inline:auto;overflow:hidden">
      ${p?`<img class="cover" src="${o(p)}" alt="">`:""}
      <div class="hero-inner container">
        <img class="avatar-ring" src="${o(v)}" alt="${i} logo">
        <div class="hero-meta">
          <h1>${i}</h1>
          ${g?`<div class="handle">${g}</div>`:""}
          ${f?`<div class="social-row mt-2">${f}</div>`:""}
        </div>
      </div>
    </section>

    <section class="container" style="max-width:980px;margin-inline:auto">
      <nav class="tabs">
        <div class="tab-nav">
          ${k}
        </div>
      </nav>

      <!-- Sections: IDs match hrefs so clicks scroll to them -->
      <div id="about" class="mt-3 card" style="scroll-margin-top: 90px;">
        <h2 class="mt-0">About</h2>
        ${t.description?`<p>${o(t.description).replace(/\n/g,"<br/>")}</p>`:'<p class="muted">No description yet.</p>'}
        <dl class="meta-list mt-2">
          ${g?`<dt>Address</dt><dd>${g}</dd>`:""}
          ${t.emailPublic?`<dt>Email</dt><dd>${o(t.emailPublic)}</dd>`:""}
          ${t.phonePublic?`<dt>Phone</dt><dd>${o(t.phonePublic)}</dd>`:""}
        </dl>
      </div>

      <div id="photos" class="mt-3 card" style="scroll-margin-top: 90px;">
        <h2 class="mt-0">Photos</h2>
        ${Array.isArray(t.mediaKeys)&&t.mediaKeys.length?`
          <div class="media-grid mt-2">
            ${t.mediaKeys.map(s=>{const r=String(s||"");return r.startsWith("raw/")?'<div class="media-card"><img src="/assets/image-processing.svg" alt="Processing…"></div>':`<div class="media-card"><img src="${o(m(r))}" alt=""></div>`}).join("")}
          </div>`:'<p class="muted">No photos yet.</p>'}
      </div>

      <div id="videos" class="mt-3 card" style="scroll-margin-top: 90px;">
        <h2 class="mt-0">Videos</h2>
        ${Array.isArray(t.highlights)&&t.highlights.length?`
          <div class="media-grid mt-2">
            ${t.highlights.map(s=>{const r=String(s||""),n=/youtube|youtu\.be/i.test(r),c=r.startsWith("public/")||r.startsWith("raw/")?m(r):r;return`
                <div class="media-card">
                  ${n?`<iframe width="100%" height="220" src="${o(c).replace("watch?v=","embed/")}" title="Video" frameborder="0" allowfullscreen></iframe>`:`<video src="${o(c)}" controls></video>`}
                </div>`}).join("")}
          </div>
        `:'<p class="muted">No videos yet.</p>'}
      </div>

      <div id="tryouts" class="mt-3 card" style="scroll-margin-top: 90px;">
        <h2 class="mt-0">Upcoming Tryouts</h2>
        ${T(a)}
      </div>

      ${Array.isArray(t.rosterHandles)&&t.rosterHandles.length?`
        <div id="roster" class="mt-3 card" style="scroll-margin-top: 90px;">
          <h2 class="mt-0">Roster</h2>
          <div class="media-grid mt-2">
            ${t.rosterHandles.map(s=>`
              <a class="media-card" href="/w/#${encodeURIComponent(s)}" aria-label="View roster profile ${o(s)}">
                <img src="/assets/avatar-fallback.svg" alt="">
              </a>`).join("")}
          </div>
        </div>`:""}
    </section>
  `;const I=e.querySelector(".tab-nav"),h=Array.from(I.querySelectorAll("a")),S=h.map(s=>document.getElementById(s.getAttribute("href").replace("#",""))).filter(Boolean);h.forEach(s=>{s.addEventListener("click",r=>{r.preventDefault();const n=s.getAttribute("href").replace("#",""),c=document.getElementById(n);c&&(c.scrollIntoView({behavior:"smooth",block:"start"}),h.forEach($=>$.setAttribute("aria-current",$===s?"page":"false")),history.replaceState(null,"",`#${n}`))})});const x=new IntersectionObserver(s=>{let r=null;for(const n of s)n.isIntersecting&&(!r||n.boundingClientRect.top<r.boundingClientRect.top)&&(r=n);if(r){const n=r.target.id;h.forEach(c=>c.setAttribute("aria-current",c.getAttribute("href")===`#${n}`?"page":"false"))}},{rootMargin:"-40% 0px -55% 0px",threshold:[0,1]});S.forEach(s=>x.observe(s))}async function A(){const e=B(),t=document.getElementById("pp-wrap");if(t){if(!e){t.innerHTML='<p class="muted">Missing promotion id.</p>';return}try{const[a,i]=await Promise.all([b(`/profiles/promoters/${encodeURIComponent(e)}`),b(`/promoters/${encodeURIComponent(e)}/tryouts`)]);C(t,a,i)}catch(a){if(String(a).includes("API 401")){t.innerHTML='<p class="muted">Please sign in to view this promotion.</p>';return}t.innerHTML='<p class="muted">Could not load promotion.</p>',console.error(a)}}}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",A,{once:!0}):A();
