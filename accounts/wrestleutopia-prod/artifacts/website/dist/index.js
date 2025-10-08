import{g as s,i as d,a as n}from"./chunks/include-BthP2BiG.js";import"./chunks/home-redirect-kmNQFPwy.js";import"./chunks/home-auth-cta-DSLKTHOp.js";import"https://esm.sh/aws-amplify@6";import"https://esm.sh/aws-amplify@6/auth";import"https://esm.sh/aws-amplify@6/utils";const r=async()=>{try{const e=await s();if(d(e)||n(e)){const t=document.getElementById("free-offer");t&&t.remove()}}catch(e){console.error("home-free-offer-hide failed",e)}};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",r,{once:!0}):r();const o=()=>`
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
`,a=async()=>{try{const e=await s();if(d(e)||n(e))return;const t=document.querySelector("#home-tryouts");if(!t)return;t.innerHTML=o()+o()+o()}catch(e){console.error("home-tryouts-locked failed",e)}};document.readyState==="loading"?document.addEventListener("DOMContentLoaded",a,{once:!0}):a();
