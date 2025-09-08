// Auth wiring for Cognito (Amplify v6) with a modal UI.
// Load this with <script type="module" defer src="js/auth.js"></script>

import { Amplify } from 'https://cdn.jsdelivr.net/npm/aws-amplify@6.x/dist/esm/index.js';
import {
  signUp,
  confirmSignUp,
  signIn,
  signOut,
  fetchAuthSession,
} from 'https://cdn.jsdelivr.net/npm/aws-amplify@6.x/dist/esm/auth/index.js';

// ==== CONFIG: paste values from `terraform output` ====
const AWS_REGION = 'us-east-1';
const USER_POOL_ID = 'YOUR_USER_POOL_ID';
const USER_POOL_CLIENT_ID = 'YOUR_USER_POOL_WEB_CLIENT_ID';
// ======================================================

Amplify.configure({
  Auth: {
    Cognito: {
      region: AWS_REGION,
      userPoolId: USER_POOL_ID,
      userPoolClientId: USER_POOL_CLIENT_ID,
      loginWith: { username: false, email: true, phone: false },
    },
  },
});

// Utility: simple toast (uses your existing #toast if present)
function toast(text, type = 'success') {
  const t = document.querySelector('#toast');
  if (!t) return alert(text);
  t.textContent = text;
  t.classList.remove('error');
  if (type === 'error') t.classList.add('error');
  t.style.display = 'block';
  setTimeout(() => (t.style.display = 'none'), 2600);
}

// Wait for element helper (partials load async)
function waitForElement(sel, { timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(sel);
    if (el) return resolve(el);
    const obs = new MutationObserver(() => {
      const found = document.querySelector(sel);
      if (found) {
        obs.disconnect();
        resolve(found);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      obs.disconnect();
      reject(new Error(`Timeout waiting for ${sel}`));
    }, timeout);
  });
}

function show(el) { el && el.classList.remove('hidden'); }
function hide(el) { el && el.classList.add('hidden'); }

async function getGroups() {
  try {
    const session = await fetchAuthSession();
    const idToken = session?.tokens?.idToken?.toString();
    if (!idToken) return [];
    const payload = JSON.parse(atob(idToken.split('.')[1]));
    return payload['cognito:groups'] || [];
  } catch {
    return [];
  }
}

async function updateRoleGatedUI() {
  const groups = await getGroups();
  const isPromoter = groups.includes('Promoters');
  document.querySelectorAll('[data-requires="promoter"]').forEach((el) => {
    el.style.display = isPromoter ? '' : 'none';
  });
  // Optional signed-in/signed-out toggles
  const signedIn = groups.length > 0;
  document.querySelectorAll('[data-auth="in"]').forEach((el) => {
    el.style.display = signedIn ? '' : 'none';
  });
  document.querySelectorAll('[data-auth="out"]').forEach((el) => {
    el.style.display = signedIn ? 'none' : '';
  });
}

async function wireAuth() {
  // Ensure the modal partial is present
  await waitForElement('#auth-modal').catch(() => {});
  const modal = document.getElementById('auth-modal');
  if (!modal) return; // nothing to wire

  const fLogin   = modal.querySelector('#form-login');
  const fSignup  = modal.querySelector('#form-signup');
  const fConfirm = modal.querySelector('#form-confirm');
  const tabLogin  = modal.querySelector('#tab-login');
  const tabSignup = modal.querySelector('#tab-signup');
  const btnClose  = modal.querySelector('#auth-close');

  // Open modal when clicking the site "Log In" button/link
  // Supports either #login-btn OR .wu-login (your current nav)
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('#login-btn, .wu-login');
    if (!trigger) return;
    e.preventDefault();
    hide(fSignup); hide(fConfirm); show(fLogin);
    tabLogin?.setAttribute('aria-selected', 'true');
    tabSignup?.setAttribute('aria-selected', 'false');
    modal.showModal();
  });

  btnClose?.addEventListener('click', () => modal.close());

  // Tabs
  tabLogin?.addEventListener('click', () => {
    hide(fSignup); hide(fConfirm); show(fLogin);
    tabLogin.setAttribute('aria-selected', 'true');
    tabSignup.setAttribute('aria-selected', 'false');
  });
  tabSignup?.addEventListener('click', () => {
    hide(fLogin); hide(fConfirm); show(fSignup);
    tabSignup.setAttribute('aria-selected', 'true');
    tabLogin.setAttribute('aria-selected', 'false');
  });

  // Sign Up flow
  fSignup?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(fSignup);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    const role = String(data.get('role') || 'Wrestler');

    try {
      await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            'custom:role': role,
          },
        },
      });
      hide(fSignup); hide(fLogin); show(fConfirm);
      fConfirm.dataset.email = email;
      toast('We emailed you a confirmation code');
    } catch (err) {
      console.error(err);
      toast('Sign-up failed', 'error');
    }
  });

  // Confirm
  fConfirm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = fConfirm.dataset.email;
    const code = String(new FormData(fConfirm).get('code') || '').trim();
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
      toast('Confirmed! You can log in now.');
      hide(fConfirm); show(fLogin);
    } catch (err) {
      console.error(err);
      toast('Confirmation failed', 'error');
    }
  });

  // Log In
  fLogin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(fLogin);
    const email = String(data.get('email') || '').trim();
    const password = String(data.get('password') || '');
    try {
      await signIn({ username: email, password });
      await updateRoleGatedUI();
      modal.close();
      toast('Logged in!');
    } catch (err) {
      console.error(err);
      toast('Login failed', 'error');
    }
  });

  // Optional: expose a logout helper (call from any button with id="logout-btn")
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#logout-btn')) return;
    e.preventDefault();
    try {
      await signOut();
      await updateRoleGatedUI();
      toast('Logged out');
    } catch (err) {
      console.error(err);
      toast('Logout failed', 'error');
    }
  });

  // Initial UI state on load
  updateRoleGatedUI();
}

// Ensure we wire after DOM is ready (and after partials likely loaded)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireAuth);
} else {
  wireAuth();
}
