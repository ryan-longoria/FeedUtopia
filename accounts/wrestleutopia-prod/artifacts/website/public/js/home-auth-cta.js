import { getAuthState, isPromoter, isWrestler } from '/js/roles.js';

function openSignup(intent = 'generic') {
  try {
    if (window.Auth?.open) { window.Auth.open('signup', { intent }); return; }

    window.dispatchEvent(new CustomEvent('auth:open', { detail: { mode: 'signup', intent } }));

    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.click();
  } catch (e) {
    console.error('openSignup failed', e);
  }
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('a,button');
  if (!el) return;

  if (el.dataset.auth === 'out') {
    e.preventDefault();
    const intent =
      el.id?.includes('promoter') ? 'promoter' :
      el.id?.includes('talent')   ? 'wrestler'  :
      (el.getAttribute('aria-label')?.includes('Promoter') ? 'promoter' :
       el.getAttribute('aria-label')?.includes('Talent')   ? 'wrestler'  : 'generic');
    openSignup(intent);
    return;
  }

  if (el.dataset.requires) {
    e.preventDefault();
    try {
      const s = await getAuthState();
      const need = el.dataset.requires;
      const ok =
        (need === 'wrestler' && isWrestler(s)) ||
        (need === 'promoter' && isPromoter(s));
      if (!ok) {
        openSignup(need);
      } else {
        window.location.href = el.getAttribute('href') || '#';
      }
    } catch (err) {
      console.error('auth-cta role check failed', err);
      openSignup(el.dataset.requires || 'generic');
    }
  }
});