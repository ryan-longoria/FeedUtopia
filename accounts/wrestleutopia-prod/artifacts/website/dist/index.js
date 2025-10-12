const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["chunks/core-DMEOCLyK.js","assets/core-Bsovybpk.css"])))=>i.map(i=>d[i]);
import{_ as $,a as w,g as p,i as y,b as f}from"./chunks/core-DMEOCLyK.js";import"./chunks/home-auth-cta-CYqsu5Hb.js";import"https://esm.sh/aws-amplify@6";import"https://esm.sh/aws-amplify@6/auth";import"https://esm.sh/aws-amplify@6/utils";async function S(){var e,t;try{const{fetchAuthSession:l}=await $(async()=>{const{fetchAuthSession:i}=await import("./chunks/core-DMEOCLyK.js").then(c=>c.e);return{fetchAuthSession:i}},__vite__mapDeps([0,1])),o=await l(),r=(t=(e=o==null?void 0:o.tokens)==null?void 0:e.idToken)==null?void 0:t.toString();if(!r)return[];const n=JSON.parse(atob(r.split(".")[1]))["cognito:groups"];return Array.isArray(n)?n:typeof n=="string"&&n?[n]:[]}catch{return[]}}function H(){const e=location.pathname.split("/").pop()||"index.html";document.querySelectorAll(".nav-links a").forEach(t=>{t.getAttribute("href")===e&&t.classList.add("active")})}async function M(e){const t=document.querySelector("#home-tryouts");if(!(!t||!e.includes("Wrestlers")))try{let o=[];try{o=await w("/tryouts")}catch(s){if(String(s).includes("API 401")){t.innerHTML='<p class="muted">Sign in to see current tryouts.</p>';return}throw s}const r=(o||[]).slice(0,6);if(t.innerHTML="",r.length===0){t.innerHTML='<p class="muted">No open tryouts yet.</p>';return}r.forEach(s=>{const n=s.tryoutId||s.id||"",i=s.orgName||s.org||"",c=s.city||"",d=s.date?new Date(s.date).toLocaleDateString():"",u=s.requirements||"",m=(s.status||"open").toUpperCase(),a=document.createElement("div");a.className="card",a.innerHTML=`
        <div class="badge">${m}</div>
        <h3 style="margin:6px 0 2px">${i}</h3>
        <div class="muted">${c} • ${d}</div>
        <p class="mt-3">${u}</p>
        <a class="btn small mt-3" href="talent.html#search">View</a>
      `,a.dataset.tryoutId=n,t.appendChild(a)})}catch(o){console.error(o),t.innerHTML='<p class="muted">Could not load tryouts.</p>'}}async function T(e){const t=document.querySelector("#home-talent");if(!t)return;if(!e.includes("Promoters")){const o=t.closest("section");o&&(o.style.display="none");return}try{const r=(await w("/profiles/wrestlers")||[]).slice(0,8);if(t.innerHTML="",r.length===0){t.innerHTML='<p class="muted">No talent to show yet.</p>';return}r.forEach(s=>{const n=s.ring||s.ringName||s.name||"Wrestler",i=s.name||"",c=s.years??s.yearsExperience??0,d=Array.isArray(s.styles)?s.styles:[],u=s.avatar||`https://picsum.photos/seed/${encodeURIComponent(n)}/200/200`,m=s.city||"",a=document.createElement("div");a.className="card",a.innerHTML=`
        <div class="profile">
          <img src="${u}" alt="${n} profile" />
          <div class="info">
            <div><strong>${n}</strong> <span class="muted">(${i})</span></div>
            <div class="mt-2">${m} • ${c} yrs • ${d.join(", ")}</div>
            <a class="btn small mt-3" href="talent.html#search">View profiles</a>
          </div>
        </div>
      `,t.appendChild(a)})}catch(o){console.log("Talent spotlight hidden:",(o==null?void 0:o.message)||o);const r=t.closest("section");r&&(r.style.display="none")}}async function L(){H();const e=await S();await Promise.all([M(e),T(e)])}document.addEventListener("DOMContentLoaded",L);window.addEventListener("auth:changed",L);(async()=>{try{if(!/^(\/|\/index\.html)$/.test(location.pathname))return;const t=await p();if(!t)return;if(y(t)){location.replace("/dashboard_promoter.html");return}if(f(t)){location.replace("/dashboard_wrestler.html");return}}catch(e){console.error("home-redirect failed",e)}})();const g=async()=>{try{const e=await p();if(y(e)||f(e)){const t=document.getElementById("free-offer");t&&t.remove()}}catch(e){console.error("home-free-offer-hide failed",e)}};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",g,{once:!0}):g();const h=()=>`
  <div class="card locked-card wrestler-only">
    <div class="profile blurred">
      <img src="https://picsum.photos/seed/tryoutlock${Math.floor(Math.random()*9999)}/200/200" alt="Locked tryout" width="200" height="200" loading="lazy"/>
      <div class="info">
        <div><strong>— — —</strong> <span class="muted">(— — —)</span></div>
        <div class="mt-2">— — • —/—/— • —, —</div>
        <p class="mt-2 muted">Full details and one-click apply are available to wrestlers.</p>
        <a class="btn small mt-3" href="#" data-auth="out">Create free wrestler account</a>
      </div>
    </div>
  </div>
`,v=async()=>{try{const e=await p();if(y(e)||f(e))return;const t=document.querySelector("#home-tryouts");if(!t)return;t.innerHTML=h()+h()+h()}catch(e){console.error("home-tryouts-locked failed",e)}};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",v,{once:!0}):v();
