const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["chunks/roles-CaKbrTUl.js","assets/roles-Bsovybpk.css"])))=>i.map(i=>d[i]);
import{_ as S}from"./preload-helper-D7HrI6pR.js";import{a as w}from"./api-cu99Gag1.js";import{g as y,i as p,a as f}from"./roles-CaKbrTUl.js";async function $(){var t,e;try{const{fetchAuthSession:l}=await S(async()=>{const{fetchAuthSession:i}=await import("./roles-CaKbrTUl.js").then(c=>c.b);return{fetchAuthSession:i}},__vite__mapDeps([0,1])),o=await l(),r=(e=(t=o==null?void 0:o.tokens)==null?void 0:t.idToken)==null?void 0:e.toString();if(!r)return[];const n=JSON.parse(atob(r.split(".")[1]))["cognito:groups"];return Array.isArray(n)?n:typeof n=="string"&&n?[n]:[]}catch{return[]}}function M(){const t=location.pathname.split("/").pop()||"index.html";document.querySelectorAll(".nav-links a").forEach(e=>{e.getAttribute("href")===t&&e.classList.add("active")})}async function T(t){const e=document.querySelector("#home-tryouts");if(!(!e||!t.includes("Wrestlers")))try{let o=[];try{o=await w("/tryouts")}catch(s){if(String(s).includes("API 401")){e.innerHTML='<p class="muted">Sign in to see current tryouts.</p>';return}throw s}const r=(o||[]).slice(0,6);if(e.innerHTML="",r.length===0){e.innerHTML='<p class="muted">No open tryouts yet.</p>';return}r.forEach(s=>{const n=s.tryoutId||s.id||"",i=s.orgName||s.org||"",c=s.city||"",d=s.date?new Date(s.date).toLocaleDateString():"",u=s.requirements||"",m=(s.status||"open").toUpperCase(),a=document.createElement("div");a.className="card",a.innerHTML=`
        <div class="badge">${m}</div>
        <h3 style="margin:6px 0 2px">${i}</h3>
        <div class="muted">${c} • ${d}</div>
        <p class="mt-3">${u}</p>
        <a class="btn small mt-3" href="talent.html#search">View</a>
      `,a.dataset.tryoutId=n,e.appendChild(a)})}catch(o){console.error(o),e.innerHTML='<p class="muted">Could not load tryouts.</p>'}}async function E(t){const e=document.querySelector("#home-talent");if(!e)return;if(!t.includes("Promoters")){const o=e.closest("section");o&&(o.style.display="none");return}try{const r=(await w("/profiles/wrestlers")||[]).slice(0,8);if(e.innerHTML="",r.length===0){e.innerHTML='<p class="muted">No talent to show yet.</p>';return}r.forEach(s=>{const n=s.ring||s.ringName||s.name||"Wrestler",i=s.name||"",c=s.years??s.yearsExperience??0,d=Array.isArray(s.styles)?s.styles:[],u=s.avatar||`https://picsum.photos/seed/${encodeURIComponent(n)}/200/200`,m=s.city||"",a=document.createElement("div");a.className="card",a.innerHTML=`
        <div class="profile">
          <img src="${u}" alt="${n} profile" />
          <div class="info">
            <div><strong>${n}</strong> <span class="muted">(${i})</span></div>
            <div class="mt-2">${m} • ${c} yrs • ${d.join(", ")}</div>
            <a class="btn small mt-3" href="talent.html#search">View profiles</a>
          </div>
        </div>
      `,e.appendChild(a)})}catch(o){console.log("Talent spotlight hidden:",(o==null?void 0:o.message)||o);const r=e.closest("section");r&&(r.style.display="none")}}async function L(){M();const t=await $();await Promise.all([T(t),E(t)])}document.addEventListener("DOMContentLoaded",L);window.addEventListener("auth:changed",L);(async()=>{try{const t=await y();p(t)&&location.replace("dashboard_promoter.html"),f(t)&&location.replace("dashboard_wrestler.html")}catch(t){console.error("home-redirect failed",t)}})();const g=async()=>{try{const t=await y();if(p(t)||f(t)){const e=document.getElementById("free-offer");e&&e.remove()}}catch(t){console.error("home-free-offer-hide failed",t)}};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",g,{once:!0}):g();const h=()=>`
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
`,v=async()=>{try{const t=await y();if(p(t)||f(t))return;const e=document.querySelector("#home-tryouts");if(!e)return;e.innerHTML=h()+h()+h()}catch(t){console.error("home-tryouts-locked failed",t)}};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",v,{once:!0}):v();
