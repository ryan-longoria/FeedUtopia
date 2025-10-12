import{a as I}from"./chunks/core-DMEOCLyK.js";import{m as g}from"./chunks/media-zB9oTFcx.js";import"https://esm.sh/aws-amplify@6";import"https://esm.sh/aws-amplify@6/auth";import"https://esm.sh/aws-amplify@6/utils";const s=e=>String(e??"").replace(/[&<>"]/g,i=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[i]),L=e=>/^public\/wrestlers\/profiles\//.test(String(e))||/^profiles\//.test(String(e));function E(e){if(!e)return"/assets/avatar-fallback.svg";const i=String(e);return i.startsWith("raw/")?"/assets/image-processing.svg":g(i)}function K(e){const i=Math.round(Number(e));if(!Number.isFinite(i)||i<=0)return null;const n=Math.floor(i/12),t=i%12;return`${n}'${t}"`}function P(e){const i=Number(e);return!Number.isFinite(i)||i<=0?null:`${i} lb`}function d(e,i){const n=String(e||"").trim();try{const t=new URL(n,location.origin);if(!/^https?:$/.test(t.protocol))return""}catch{return""}return`<a href="${s(n)}" target="_blank" rel="noopener nofollow">${s(i||n)}</a>`}async function A(){var n;const e=document.getElementById("wp-wrap"),i=(location.hash||"").replace(/^#/,"").trim();if(e){if(!i){e.innerHTML='<div class="card"><h2>Profile not found</h2></div>';return}try{const t=await I(`/profiles/wrestlers/${encodeURIComponent(i)}`),m=t.stageName||t.ring||t.name||i,u=[t.firstName,t.middleName,t.lastName].filter(Boolean).join(" "),v=[t.city,t.region,t.country].filter(Boolean).join(" - "),f=t!=null&&t.photoKey?g(t.photoKey):"/assets/avatar-fallback.svg",S=t!=null&&t.photoKey&&L(t.photoKey)?`${f}?v=${Date.now()}`:f,p=Array.isArray(t.gimmicks)?t.gimmicks:[],$=K(t.heightIn),b=P(t.weightLb);document.title=`${m} – WrestleUtopia`;const r=t.socials||{},y=[r.website&&d(r.website,"Website"),r.twitter&&d(r.twitter,"Twitter"),r.instagram&&d(r.instagram,"Instagram"),r.tiktok&&d(r.tiktok,"TikTok"),r.youtube&&d(r.youtube,"YouTube")].filter(Boolean).join(" • ");e.innerHTML=`
      <section class="hero card" style="max-width:980px;margin-inline:auto;overflow:hidden">
        ${t.coverKey?`<img class="cover" src="${s(g(t.coverKey))}" alt="">`:""}
        <div class="hero-inner container">
          <img class="avatar-ring" src="${s(S)}" alt="${s(m)} avatar">
          <div class="hero-meta">
            <h1>${s(m)}</h1>
            <div class="stats-bar">
              ${v?`<span class="pill">${s(v)}</span>`:""}
              ${$?`<span class="pill">${$}</span>`:""}
              ${b?`<span class="pill">${b}</span>`:""}
              ${Number.isFinite(+t.experienceYears)?`<span class="pill">${t.experienceYears} yr experience</span>`:""}
              ${Array.isArray(p)&&p.length?`<span class="pill">${s(p.slice(0,3).join(" • "))}</span>`:""}
            </div>
            ${y?`<div class="social-row mt-2">${y}</div>`:""}
          </div>
        </div>
      </section>

      <section class="container" style="max-width:980px;margin-inline:auto">
        <nav class="tabs">
          <div class="tab-nav">
            <a href="#about" aria-current="page">About</a>
            <a href="#highlights">Highlights</a>
            <a href="#photos">Photos</a>
            ${t.achievements?'<a href="#achievements">Achievements</a>':""}
          </div>
        </nav>

        <!-- Sections use IDs that match the hrefs so clicks scroll to them -->
        <div id="about" class="mt-3 card" style="scroll-margin-top: 90px;">
          <h2 class="mt-0">About</h2>
          ${t.bio?`<p>${s(t.bio).replace(/\n/g,"<br/>")}</p>`:'<p class="muted">No bio yet.</p>'}
          <dl class="meta-list mt-2">
            ${u?`<dt>Name</dt><dd>${s(u)}</dd>`:""}
            ${t.emailPublic?`<dt>Email</dt><dd>${s(t.emailPublic)}</dd>`:""}
            ${t.phonePublic?`<dt>Phone</dt><dd>${s(t.phonePublic)}</dd>`:""}
            ${t.styles?`<dt>Style</dt><dd>${s(t.styles)}</dd>`:""}
            ${(n=t.gimmicks)!=null&&n.length?`<dt>Gimmicks</dt><dd>${t.gimmicks.map(a=>`<span class="chip">${s(a)}</span>`).join(" ")}</dd>`:""}
          </dl>
        </div>

        <div id="highlights" class="mt-3" style="scroll-margin-top: 90px;">
          ${Array.isArray(t.highlights)&&t.highlights.length?`
            <div class="media-grid">
              ${t.highlights.map(a=>`
                <div class="media-card">
                  ${/youtube|youtu\.be/i.test(String(a))?`<iframe width="100%" height="220" src="${s(String(a)).replace("watch?v=","embed/")}" title="Highlight" frameborder="0" allowfullscreen></iframe>`:`<video src="${s(String(a))}" controls></video>`}
                </div>`).join("")}
            </div>
          `:'<div class="card"><p class="muted">No highlight videos yet.</p></div>'}
        </div>

        <div id="photos" class="mt-3" style="scroll-margin-top: 90px;">
          ${Array.isArray(t.mediaKeys)&&t.mediaKeys.length?`
            <div class="media-grid">
              ${t.mediaKeys.map(a=>`<div class="media-card"><img src="${s(E(a))}" alt=""></div>`).join("")}
            </div>
          `:'<div class="card"><p class="muted">No photos yet.</p></div>'}
        </div>

        ${t.achievements?`
          <div id="achievements" class="mt-3 card" style="scroll-margin-top: 90px;">
            <h2 class="mt-0">Achievements</h2>
            <p>${s(t.achievements).replace(/\n/g,"<br/>")}</p>
          </div>
        `:""}
      </section>
    `;const k=e.querySelector(".tab-nav"),h=Array.from(k.querySelectorAll("a")),x=h.map(a=>document.getElementById(a.getAttribute("href").replace("#",""))).filter(Boolean);h.forEach(a=>{a.addEventListener("click",c=>{c.preventDefault();const o=a.getAttribute("href").replace("#",""),l=document.getElementById(o);l&&(l.scrollIntoView({behavior:"smooth",block:"start"}),h.forEach(w=>w.setAttribute("aria-current",w===a?"page":"false")),history.replaceState(null,"",`#${o}`))})});const N=new IntersectionObserver(a=>{let c=null;for(const o of a)o.isIntersecting&&(!c||o.boundingClientRect.top<c.boundingClientRect.top)&&(c=o);if(c){const o=c.target.id;h.forEach(l=>l.setAttribute("aria-current",l.getAttribute("href")===`#${o}`?"page":"false"))}},{rootMargin:"-40% 0px -55% 0px",threshold:[0,1]});x.forEach(a=>N.observe(a))}catch(t){if(String(t).includes("API 401")){e.innerHTML='<div class="card"><h2>Sign in required</h2><p class="muted">Please sign in to view this profile.</p></div>';return}console.error(t),e.innerHTML=`<div class="card"><h2>Profile not found</h2><p class="muted">We couldn’t load ${s(i)}.</p></div>`}}}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",A):A();
