(function(){
  const amplifyGlobal = window.aws_amplify || {};
  const Amplify = amplifyGlobal.Amplify;
  const Auth = amplifyGlobal.Auth;

  if (!Amplify || !Auth) {
    console.error('Amplify/Auth not available. Check the loader script and CDN.');
    return;
  }

  // ==== CONFIG: paste values from `terraform output` ====
  const AWS_REGION = 'us-east-2';
  const USER_POOL_ID = 'YOUR_USER_POOL_ID';
  const USER_POOL_CLIENT_ID = 'YOUR_USER_POOL_WEB_CLIENT_ID';
  // ======================================================

  Amplify.configure({
    Auth: {
      region: AWS_REGION,
      userPoolId: USER_POOL_ID,
      userPoolWebClientId: USER_POOL_CLIENT_ID, // v5 UMD name
      authenticationFlowType: 'USER_SRP_AUTH'
    }
  });

  // Toast helper
  function toast(text, type='success'){
    const t=document.querySelector('#toast'); if(!t) return alert(text);
    t.textContent=text; t.classList.remove('error'); if(type==='error') t.classList.add('error');
    t.style.display='block'; setTimeout(()=>t.style.display='none', 2600);
  }

  function show(el){ el && el.classList.remove('hidden'); }
  function hide(el){ el && el.classList.add('hidden'); }

  // Read groups from current session (ID token)
  async function getGroups(){
    try{
      const session = await Auth.currentSession();
      const idToken = session.getIdToken().getJwtToken();
      const payload = JSON.parse(atob(idToken.split('.')[1]));
      return payload['cognito:groups'] || [];
    }catch{ return []; }
  }

  async function updateRoleGatedUI(){
    const groups = await getGroups();
    const isPromoter = groups.includes('Promoters');
    document.querySelectorAll('[data-requires="promoter"]').forEach(el=>{
      el.style.display = isPromoter ? '' : 'none';
    });
    const signedIn = groups.length > 0;
    document.querySelectorAll('[data-auth="in"]').forEach(el=> el.style.display = signedIn ? '' : 'none');
    document.querySelectorAll('[data-auth="out"]').forEach(el=> el.style.display = signedIn ? 'none' : '');
  }

  function wireAuth(){
    const modal = document.getElementById('auth-modal');
    if (!modal) return;

    const fLogin   = modal.querySelector('#form-login');
    const fSignup  = modal.querySelector('#form-signup');
    const fConfirm = modal.querySelector('#form-confirm');
    const tabLogin  = modal.querySelector('#tab-login');
    const tabSignup = modal.querySelector('#tab-signup');
    const btnClose  = modal.querySelector('#auth-close');

    // Open modal from nav
    document.addEventListener('click', (e)=>{
      const trigger = e.target.closest('#login-btn, .wu-login');
      if(!trigger) return;
      e.preventDefault();
      hide(fSignup); hide(fConfirm); show(fLogin);
      tabLogin?.setAttribute('aria-selected','true');
      tabSignup?.setAttribute('aria-selected','false');
      modal.showModal();
    });

    btnClose?.addEventListener('click', ()=> modal.close());

    // Tabs
    tabLogin?.addEventListener('click', ()=>{
      hide(fSignup); hide(fConfirm); show(fLogin);
      tabLogin.setAttribute('aria-selected','true');
      tabSignup.setAttribute('aria-selected','false');
    });
    tabSignup?.addEventListener('click', ()=>{
      hide(fLogin); hide(fConfirm); show(fSignup);
      tabSignup.setAttribute('aria-selected','true');
      tabLogin.setAttribute('aria-selected','false');
    });

    // Sign Up
    fSignup?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const d = new FormData(fSignup);
      const email = String(d.get('email')||'').trim();
      const password = String(d.get('password')||'');
      const role = String(d.get('role')||'Wrestler');

      try{
        await Auth.signUp({
          username: email,
          password,
          attributes: { email, 'custom:role': role }
        });
        hide(fSignup); hide(fLogin); show(fConfirm);
        fConfirm.dataset.email = email;
        toast('We emailed you a confirmation code');
      }catch(err){
        console.error(err); toast('Sign-up failed', 'error');
      }
    });

    // Confirm
    fConfirm?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const email = fConfirm.dataset.email;
      const code = String(new FormData(fConfirm).get('code')||'').trim();
      try{
        await Auth.confirmSignUp(email, code);
        toast('Confirmed! You can log in now.');
        hide(fConfirm); show(fLogin);
      }catch(err){
        console.error(err); toast('Confirmation failed', 'error');
      }
    });

    // Log In
    fLogin?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const d = new FormData(fLogin);
      const email = String(d.get('email')||'').trim();
      const password = String(d.get('password')||'');
      try{
        await Auth.signIn(email, password);
        await updateRoleGatedUI();
        modal.close();
        toast('Logged in!');
      }catch(err){
        console.error(err); toast('Login failed', 'error');
      }
    });

    // Log out
    document.addEventListener('click', async (e)=>{
      if(!e.target.closest('#logout-btn')) return;
      e.preventDefault();
      try { await Auth.signOut(); await updateRoleGatedUI(); toast('Logged out'); }
      catch(err){ console.error(err); toast('Logout failed', 'error'); }
    });

    // Initial toggle
    updateRoleGatedUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireAuth);
  } else {
    wireAuth();
  }
})();
