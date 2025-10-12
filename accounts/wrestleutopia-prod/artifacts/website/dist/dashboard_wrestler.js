import{g as p,b as g,a as l,d as f}from"./chunks/core-DMEOCLyK.js";import"https://esm.sh/aws-amplify@6";import"https://esm.sh/aws-amplify@6/auth";import"https://esm.sh/aws-amplify@6/utils";const w=t=>{try{return new Date(t).toLocaleDateString()}catch{return t||""}},v=t=>{const n=new Date(t),r=new Date;return isNaN(n)?9999:Math.ceil((n-r)/(1e3*60*60*24))};async function L(){try{try{const t=await l("/profiles/wrestlers/me");if(t)return t}catch{}try{const t=await l("/profiles/wrestlers?me=true");if(Array.isArray(t)&&t.length)return t[0]}catch{}}catch{}return null}function A(t){const n=t.tryoutId||t.id||"",r=t.orgName||t.org||"Promotion",a=t.ownerId||"",c=t.city||"—",s=w(t.date),o=t.requirements||"Basic bumps, cardio, promo.",e=typeof t.slots=="number"?`<span class="muted" style="margin-left:10px">Slots: ${t.slots}</span>`:"",i=(t.status||"open").toString().toUpperCase(),d=document.createElement("div");return d.className="card",d.innerHTML=`
    <div class="badge">${i}</div>
    <h3 style="margin:6px 0 2px">
      ${a?`<a href="/p/#${encodeURIComponent(a)}">${r}</a>`:r}
    </h3>
    <div class="muted">${c} • ${s}</div>
    <p class="mt-3">${o}</p>
    <div class="mt-3">
      <a class="btn small" href="tryouts.html#${n}" data-requires="wrestler">Apply</a>
      ${e}
    </div>
  `,d}function u(t){t.innerHTML=`
    <div class="card">
      <h3>No recommended tryouts yet</h3>
      <p class="muted">We couldn’t find any upcoming open tryouts right now. Check back soon or browse all tryouts.</p>
      <div class="mt-3">
        <a class="btn small secondary" href="tryouts.html">Browse all tryouts</a>
      </div>
    </div>`}function b(t,n){const r=v(t.date);let a=Math.max(0,60-Math.min(60,r));if(n){n.city&&t.city&&n.city.toLowerCase()===t.city.toLowerCase()&&(a+=20);const s=Array.isArray(n.styles)?n.styles.map(o=>String(o).toLowerCase()):[];if(s.length){const o=[t.requirements,t.title,t.orgName,t.org].filter(Boolean).join(" ").toLowerCase(),e=s.filter(i=>o.includes(i)).length;a+=Math.min(20,e*7)}}return a}async function I(){const t=document.getElementById("dash-tryouts");if(t){t.innerHTML=`
    <div class="card">
      <h3>Loading recommended tryouts…</h3>
      <p class="muted">Fetching the latest openings for you.</p>
    </div>`;try{const n=await p();if(!g(n)){u(t);return}let r,a=[];try{[r,a]=await Promise.all([L(),l("/tryouts")])}catch(e){if(String(e).includes("API 401")){t.innerHTML='<div class="card"><p class="muted">Please sign in to view recommended tryouts.</p></div>';return}throw e}const c=new Date,s=f(a).filter(e=>{const i=new Date(e.date);return(e.status||"open")==="open"&&!isNaN(i)&&i>=c});if(!s.length){u(t);return}const o=s.map(e=>({t:e,score:b(e,r)})).sort((e,i)=>i.score-e.score).slice(0,6).map(e=>e.t);t.innerHTML="",o.forEach(e=>t.appendChild(A(e)))}catch(n){console.error("dash recommended tryouts error",n),u(t)}}}function m(t){t.innerHTML=`
    <div class="card">
      <h3>No applications yet</h3>
      <p class="muted">When you apply to a tryout, it will show up here.</p>
    </div>`}function M(t){const n=t.reelLink||t.reel||"#",r=t.timestamp||t.created_at||t.createdAt||new Date().toISOString(),a=t.tryoutOrg||t.orgName||t.org||"Tryout",c=(t.status||"submitted").toString().toUpperCase(),s=document.createElement("div");return s.className="card",s.innerHTML=`
    <div class="badge">${c}</div>
    <div class="mt-1"><strong>${a}</strong></div>
    <div class="mt-2"><a href="${n}" target="_blank" rel="noopener">Reel</a> • <span class="muted">${new Date(r).toLocaleString()}</span></div>
    ${t.notes?`<div class="mt-2">${t.notes}</div>`:""}
  `,s}async function S(){const t=document.getElementById("dash-apps");if(!t)return;t.innerHTML=`
    <div class="card">
      <h3>Loading applications…</h3>
    </div>`;let n;try{n=await p()}catch{}const r=(n==null?void 0:n.sub)||null;async function a(c){for(const s of c)try{return await l(s)}catch(o){const e=String(o);if(!(e.includes("API 401")||e.includes("API 403")||e.includes("API 404")))throw o}return null}try{const c=["/applications?me=true",r?`/applications?applicantId=${encodeURIComponent(r)}`:null,r?`/applications?userSub=${encodeURIComponent(r)}`:null,"/applications"].filter(Boolean);let s=f(await a(c));if(Array.isArray(s)&&r){const o=["applicantId","userSub","user_id","userId","owner","createdBy","sub","user_sub"];s=s.filter(e=>o.some(i=>((e==null?void 0:e[i])||"").toString()===r))}if(!Array.isArray(s)||!s.length){m(t);return}t.innerHTML="",s.sort((o,e)=>new Date(e.timestamp||e.createdAt||0)-new Date(o.timestamp||o.createdAt||0)).slice(0,6).forEach(o=>t.appendChild(M(o)))}catch(c){console.error("dash apps error",c),m(t)}}async function y(){await Promise.all([I(),S()])}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",y,{once:!0}):y();const h=async()=>{try{const t=await p();if(!g(t)){location.replace("index.html");return}const n=60,r=document.getElementById("profile-pct"),a=document.getElementById("profile-pct-label");r&&(r.style.width=n+"%"),a&&(a.textContent=n+"% complete")}catch(t){console.error("wrestler-guard-and-progress failed",t)}};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",h,{once:!0}):h();
