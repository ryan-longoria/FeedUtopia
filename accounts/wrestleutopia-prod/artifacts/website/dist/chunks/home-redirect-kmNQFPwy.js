const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["chunks/include-BthP2BiG.js","assets/include-Bsovybpk.css"])))=>i.map(i=>d[i]);
import{_ as y,b as h,g as f,i as g,a as v}from"./include-BthP2BiG.js";async function w(){var n,e;try{const{fetchAuthSession:l}=await y(async()=>{const{fetchAuthSession:i}=await import("./include-BthP2BiG.js").then(c=>c.e);return{fetchAuthSession:i}},__vite__mapDeps([0,1])),s=await l(),o=(e=(n=s==null?void 0:s.tokens)==null?void 0:n.idToken)==null?void 0:e.toString();if(!o)return[];const r=JSON.parse(atob(o.split(".")[1]))["cognito:groups"];return Array.isArray(r)?r:typeof r=="string"&&r?[r]:[]}catch{return[]}}function L(){const n=location.pathname.split("/").pop()||"index.html";document.querySelectorAll(".nav-links a").forEach(e=>{e.getAttribute("href")===n&&e.classList.add("active")})}async function T(n){const e=document.querySelector("#home-tryouts");if(!(!e||!n.includes("Wrestlers")))try{let s=[];try{s=await h("/tryouts")}catch(t){if(String(t).includes("API 401")){e.innerHTML='<p class="muted">Sign in to see current tryouts.</p>';return}throw t}const o=(s||[]).slice(0,6);if(e.innerHTML="",o.length===0){e.innerHTML='<p class="muted">No open tryouts yet.</p>';return}o.forEach(t=>{const r=t.tryoutId||t.id||"",i=t.orgName||t.org||"",c=t.city||"",d=t.date?new Date(t.date).toLocaleDateString():"",u=t.requirements||"",m=(t.status||"open").toUpperCase(),a=document.createElement("div");a.className="card",a.innerHTML=`
        <div class="badge">${m}</div>
        <h3 style="margin:6px 0 2px">${i}</h3>
        <div class="muted">${c} • ${d}</div>
        <p class="mt-3">${u}</p>
        <a class="btn small mt-3" href="talent.html#search">View</a>
      `,a.dataset.tryoutId=r,e.appendChild(a)})}catch(s){console.error(s),e.innerHTML='<p class="muted">Could not load tryouts.</p>'}}async function $(n){const e=document.querySelector("#home-talent");if(!e)return;if(!n.includes("Promoters")){const s=e.closest("section");s&&(s.style.display="none");return}try{const o=(await h("/profiles/wrestlers")||[]).slice(0,8);if(e.innerHTML="",o.length===0){e.innerHTML='<p class="muted">No talent to show yet.</p>';return}o.forEach(t=>{const r=t.ring||t.ringName||t.name||"Wrestler",i=t.name||"",c=t.years??t.yearsExperience??0,d=Array.isArray(t.styles)?t.styles:[],u=t.avatar||`https://picsum.photos/seed/${encodeURIComponent(r)}/200/200`,m=t.city||"",a=document.createElement("div");a.className="card",a.innerHTML=`
        <div class="profile">
          <img src="${u}" alt="${r} profile" />
          <div class="info">
            <div><strong>${r}</strong> <span class="muted">(${i})</span></div>
            <div class="mt-2">${m} • ${c} yrs • ${d.join(", ")}</div>
            <a class="btn small mt-3" href="talent.html#search">View profiles</a>
          </div>
        </div>
      `,e.appendChild(a)})}catch(s){console.log("Talent spotlight hidden:",(s==null?void 0:s.message)||s);const o=e.closest("section");o&&(o.style.display="none")}}async function p(){L();const n=await w();await Promise.all([T(n),$(n)])}document.addEventListener("DOMContentLoaded",p);window.addEventListener("auth:changed",p);(async()=>{try{const n=await f();g(n)&&location.replace("dashboard_promoter.html"),v(n)&&location.replace("dashboard_wrestler.html")}catch(n){console.error("home-redirect failed",n)}})();
