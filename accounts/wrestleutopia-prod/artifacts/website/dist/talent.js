import{g as r,i as a}from"./chunks/roles-CaKbrTUl.js";import"./chunks/home-auth-cta-DrGvhGkr.js";import"https://esm.sh/aws-amplify@6";import"https://esm.sh/aws-amplify@6/auth";import"https://esm.sh/aws-amplify@6/utils";const o=async()=>{try{const e=await r();if(a(e))return;const t=document.querySelector("#search");if(!t)return;t.innerHTML=`
      <h2>Talent Search <span class="badge">Locked</span></h2>
      <div class="mt-2">
        <p class="muted">Only promoters can search wrestler profiles.</p>
        <a href="#" class="btn small" data-auth="out" id="become-promoter">Create a free promoter account</a>
      </div>
    `}catch(e){console.error("talent-lock failed",e)}};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",o,{once:!0}):o();const n=()=>{const e=document.getElementById("wrestler-modal"),t=document.getElementById("wm-close");e&&t&&t.addEventListener("click",()=>e.close())};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",n,{once:!0}):n();
