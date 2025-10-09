import{g as v,i as h}from"./chunks/roles-CaKbrTUl.js";import{a as m,b as w}from"./chunks/api-cu99Gag1.js";import"https://esm.sh/aws-amplify@6";import"https://esm.sh/aws-amplify@6/auth";import"https://esm.sh/aws-amplify@6/utils";const B=t=>{try{return new Date(t).toLocaleDateString()}catch{return t||""}};function $(t){const e=t.tryoutId||t.id||"",o=t.orgName||t.org||"Promotion",n=t.ownerId||"",a=t.city||"—",c=B(t.date),s=typeof t.slots=="number"?`<span class="muted" style="margin-left:10px">Slots: ${t.slots}</span>`:"",d=(t.status||"open").toString().toUpperCase(),l=document.createElement("div");l.className="card",l.innerHTML=`
    <div class="badge">${d}</div>
    <h3 style="margin:6px 0 2px">
      ${n?`<a href="/p/#${encodeURIComponent(n)}">${o}</a>`:o}
    </h3>
    <div class="muted">${a} • ${c}</div>
    <p class="mt-3">${t.requirements||""}</p>
    <div class="mt-3" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <a class="btn small" href="tryouts.html#${e}">View</a>
      <button class="btn small" type="button" data-view-applicants="${e}" data-org="${o}" data-city="${a}" data-date="${t.date||""}">
        View Applicants
      </button>
      ${s}
    </div>`;const p=l.querySelector("[data-view-applicants]");return p==null||p.addEventListener("click",r=>{var y;const i=r.currentTarget;(y=window.openApplicantsModal)==null||y.call(window,i.dataset.viewApplicants,{org:i.dataset.org,city:i.dataset.city,date:i.dataset.date})}),l}function f(t,e,o){t.innerHTML=`
    <div class="card">
      <h3>${e}</h3>
      <p class="muted">${o}</p>
    </div>`}async function L(){const t=document.getElementById("org"),e=document.getElementById("org-hint");try{const o=await m("/profiles/promoters/me"),n=(o==null?void 0:o.orgName)||"";return t&&(t.value=n,t.readOnly=!0,t.placeholder=n?"":"Create your promotion profile first"),e&&(e.innerHTML=n?"Pulled from your Promotion profile.":'No promotion profile yet. <a href="/promoter/">Create one</a> to post tryouts.'),n}catch{return e&&(e.innerHTML='Couldn’t load your promotion. <a href="/promoter/">Create one</a>.'),""}}async function T(){const t=document.getElementById("my-active-tryouts"),e=document.getElementById("my-previous-tryouts");if(!t||!e)return;t.innerHTML='<div class="card"><h3>Loading…</h3></div>',e.innerHTML="";const o=await v();if(!h(o)){f(t,"Not authorized","Promoter role required.");return}try{const n=await m("/tryouts/mine"),a=w(n),c=new Date;c.setHours(0,0,0,0);const s=r=>(r.status||"open")==="open",d=r=>{const i=new Date(r.date);return isNaN(i)?null:i},l=a.filter(r=>{const i=d(r);return s(r)&&i&&i>=c}).sort((r,i)=>new Date(r.date)-new Date(i.date)),p=a.filter(r=>{const i=d(r);return!s(r)||!i||i<c}).sort((r,i)=>new Date(i.date)-new Date(r.date));l.length===0?f(t,"No active tryouts","Post a new tryout to get started."):(t.innerHTML="",l.forEach(r=>t.appendChild($(r)))),p.length===0?f(e,"No previous tryouts","Once your tryouts pass, they will appear here."):(e.innerHTML="",p.forEach(r=>e.appendChild($(r))))}catch(n){console.error("loadMyTryouts failed",n),f(t,"Error","Could not load your tryouts.")}}function g(t,e="success"){const o=document.createElement("div");o.textContent=t,o.style.cssText=`position:fixed;right:16px;bottom:16px;padding:10px 14px;border-radius:8px;
                      background:${e==="error"?"#3b1f2a":"#1f3b2a"};color:#fff;z-index:9999`,document.body.appendChild(o),setTimeout(()=>o.remove(),2200)}async function N(){const t=document.getElementById("tryout-form-dash");if(!t)return;let e=await L();t.addEventListener("submit",async o=>{o.preventDefault();const n=await v();if(!h(n)){g("Promoter role required","error");return}if(!e&&(e=await L(),!e)){g("Create your promotion profile first","error");return}const a=new FormData(t),c={orgName:e,city:(a.get("city")||"").trim(),date:(a.get("date")||"").trim(),slots:Number(a.get("slots")||0),requirements:(a.get("requirements")||"").trim(),contact:(a.get("contact")||"").trim(),status:"open"},s=t.querySelector('button[type="submit"]'),d=s==null?void 0:s.textContent;s&&(s.disabled=!0,s.textContent="Posting…");try{await m("/tryouts",{method:"POST",body:c}),g("Tryout posted!"),t.reset(),document.getElementById("org").value=e,await T()}catch(l){console.error(l),g("Could not post tryout","error")}finally{s&&(s.disabled=!1,s.textContent=d||"Post Tryout")}})}async function x(){await T(),await N()}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",x,{once:!0}):x();function u(t){return String(t??"").replace(/[&<>"]/g,e=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"})[e])}function A(t){try{return t?new Date(t).toLocaleString():""}catch{return t||""}}function H(t){if(!t)return"/assets/avatar-fallback.svg";if(String(t).startsWith("http"))return t;const e=(window.WU_MEDIA_BASE||"").replace(/\/+$/,"");return e?`${e}/${t}`:"/assets/avatar-fallback.svg"}function P(t){const e=document.getElementById("app-list");if(!e)return;e.innerHTML="";const o=Array.isArray(t)?t:[];if(o.length===0){e.innerHTML='<div class="card"><p class="muted">No applications yet.</p></div>';return}for(const n of o){const a=n.applicantProfile||{},c=a.handle||"",s=a.stageName||"(No stage name)",d=[a.city,a.region].filter(Boolean).join(", "),l=H(a.photoKey),p=n.timestamp?new Date(n.timestamp).toLocaleString():"",r=document.createElement("div");r.className="card",r.innerHTML=`
      <div style="display:flex;gap:12px;align-items:center">
        <img src="${l}" alt="" width="56" height="56" class="avatar br-full" loading="lazy"/>
        <div style="flex:1">
          <div class="text-lg">${s}</div>
          <div class="muted">${d||""}</div>
          <div class="muted small mt-1">${p}</div>
          ${n.notes?`<p class="mt-2">${String(n.notes).replace(/</g,"&lt;")}</p>`:""}
          ${n.reelLink?`<p class="mt-1"><a href="${n.reelLink}" target="_blank" rel="noopener">Watch Reel</a></p>`:""}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${c?`<a class="btn small" href="/w/#${encodeURIComponent(c)}">View Profile</a>`:""}
        </div>
      </div>
    `,e.appendChild(r)}}function b(t,e={}){const o=document.getElementById("apps-modal-list"),n=document.getElementById("apps-modal-subtitle"),a=document.getElementById("apps-modal");if(!o||!a)return;const c=[e.org&&`<strong>${u(e.org)}</strong>`,e.city&&u(e.city),e.date&&new Date(e.date).toLocaleDateString()].filter(Boolean);n&&(n.innerHTML=c.length?c.join(" • "):"All applicants");const s=Array.isArray(t)?t:[];if(!s.length){o.innerHTML='<div class="card"><p class="muted">No applications yet.</p></div>',a.showModal();return}o.innerHTML=s.map(d=>{const l=d.applicantProfile||{},p=l.handle||"",r=l.stageName||"(No stage name)",i=[l.city,l.region,l.country].filter(Boolean).join(", "),y=A(d.timestamp),D=d.reelLink?`<a href="${u(d.reelLink)}" target="_blank" rel="noopener">Reel</a>`:"",S=d.notes?`<div class="muted mt-1">${u(d.notes)}</div>`:"";return`
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:start;flex-wrap:wrap">
          <div style="min-width:260px">
            <div class="text-lg">
              ${p?`<a href="/w/#${encodeURIComponent(p)}">${u(r)}</a>`:u(r)}
            </div>
            <div class="muted small">${u(i)}</div>
            <div class="muted small">${u(y)}</div>
            ${S}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            ${D}
            ${p?`<a class="btn small" href="/w/#${encodeURIComponent(p)}">View Profile</a>`:""}
          </div>
        </div>
      </div>`}).join(""),a.showModal()}async function q(t,e={}){try{const o=t?`?tryoutId=${encodeURIComponent(t)}`:"",n=await m(`/applications${o}`);b(w(n),e)}catch(o){console.error(o),b([],e),typeof window.toast=="function"&&window.toast("Could not load applications","error")}}window.openApplicantsModal=q;async function O(){const t=document.getElementById("apps-filter");if(!t)return"";t.querySelectorAll("option:not(:first-child)").forEach(e=>e.remove());try{const e=await m("/tryouts/mine"),o=w(e);for(const a of o){const c=document.createElement("option");c.value=a.tryoutId||"";const s=a.date?new Date(a.date).toLocaleDateString():"";c.textContent=`${a.orgName||"Tryout"} — ${a.city||""}${s?` • ${s}`:""}`,t.appendChild(c)}const n=t.querySelector('option[value]:not([value=""])');if(n)return t.value=n.value,t.value}catch(e){console.debug("loadTryoutOptionsAndPick:",(e==null?void 0:e.message)||e)}return""}async function E(t=""){const e=t?`?tryoutId=${encodeURIComponent(t)}`:"",o=await m(`/applications${e}`);P(w(o))}async function I(){const t=await v();if(!h(t))return;const e=document.getElementById("apps-filter"),o=await O();o&&await E(o),e==null||e.addEventListener("change",()=>{const n=e.value.trim();n?E(n):document.getElementById("app-list").innerHTML='<div class="card"><p class="muted">Choose a tryout to see applicants.</p></div>'})}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",I,{once:!0}):I();const C=async()=>{try{const t=await v();h(t)||location.replace("index.html")}catch(t){console.error("promoter-guard failed",t)}};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",C,{once:!0}):C();const M=()=>{const t=document.getElementById("apps-modal"),e=document.getElementById("apps-modal-close");t&&e&&e.addEventListener("click",()=>t.close())};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",M,{once:!0}):M();
