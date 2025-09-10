// ESM Amplify v6 – uses modular 'auth' APIs and self-hosted bundle via Vite

import { Amplify } from 'aws-amplify';
import {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  confirmSignIn,
  signOut,
  fetchAuthSession,
} from 'aws-amplify/auth';

// ==== CONFIG (put your real values) ====
const AWS_REGION = 'us-east-2';
const USER_POOL_ID = 'us-east-2_9oCzdeOZF';
const USER_POOL_CLIENT_ID = '6f4qoincbfm9g0lifod7q8nuhg';
// =======================================

Amplify.configure({
  Auth: {
    Cognito: {
      region: AWS_REGION,
      userPoolId: USER_POOL_ID,
      userPoolClientId: USER_POOL_CLIENT_ID,
      loginWith: { username: false, email: true, phone: false },
      // ensure code-based verification for sign-up emails
      signUpVerificationMethod: 'code',
    }
  }
});

// Utilities
function toast(text, type = 'success') {
  const t = document.querySelector('#toast');
  if (!t) return console.log(text);
  t.textContent = text;
  t.classList.toggle('error', type === 'error');
  t.style.display = 'block';
  setTimeout(() => (t.style.display = 'none'), 2600);
}

function show(el) { el && el.classList.remove('hidden'); }
function hide(el) { el && el.classList.add('hidden'); }

function waitForElement(sel, { timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const found = document.querySelector(sel);
    if (found) return resolve(found);
    const obs = new MutationObserver(() => {
      const el = document.querySelector(sel);
      if (el) { obs.disconnect(); resolve(el); }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); reject(new Error(`Timeout waiting for ${sel}`)); }, timeout);
  });
}

async function getGroups() {
  try {
    const session = await fetchAuthSession();
    const id = session?.tokens?.idToken?.toString();
    if (!id) return [];
    const payload = JSON.parse(atob(id.split('.')[1]));
    return payload['cognito:groups'] || [];
  } catch { return []; }
}

async function updateRoleGatedUI() {
  const groups = await getGroups();
  const isSignedIn = groups.length > 0;
  document.querySelectorAll('[data-auth="in"]').forEach(el => el.style.display = isSignedIn ? '' : 'none');
  document.querySelectorAll('[data-auth="out"]').forEach(el => el.style.display = isSignedIn ? 'none' : '');
  const isPromoter = groups.includes('Promoters');
  document.querySelectorAll('[data-requires="promoter"]').forEach(el => el.style.display = isPromoter ? '' : 'none');
}

async function wireAuth() {
  await waitForElement('#auth-modal').catch(() => {});
  const modal    = document.getElementById('auth-modal');
  if (!modal) return;

  const fLogin   = modal.querySelector('#form-login');
  const fSignup  = modal.querySelector('#form-signup');
  const fConfirm = modal.querySelector('#form-confirm');
  const tabLogin  = modal.querySelector('#tab-login');
  const tabSignup = modal.querySelector('#tab-signup');
  const btnClose  = modal.querySelector('#auth-close');
  const btnResend = modal.querySelector('#resend-code'); // optional button in auth.html

  // Open modal from nav
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

  // Sign Up
  fSignup?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(fSignup);
    const email = String(d.get('email') || '').trim();
    const password = String(d.get('password') || '');
    const role = String(d.get('role') || 'Wrestler');
    try {
      await signUp({
        username: email,
        password,
        options: {
          userAttributes: { email, 'custom:role': role },
        }
      });
      hide(fSignup); hide(fLogin); show(fConfirm);
      fConfirm.dataset.email = email;
      delete fConfirm.dataset.mfa;
      fConfirm.dataset.mode = 'signup';
      toast('We emailed you a confirmation code');
    } catch (err) {
      console.error(err);
      toast('Sign-up failed', 'error');
    }
  });

  // (Optional) Resend sign-up code button
  btnResend?.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = fConfirm.dataset.email;
    if (!email) return;
    try {
      await resendSignUpCode({ username: email });
      toast('Verification code resent');
    } catch (err) {
      console.error(err);
      toast('Could not resend code', 'error');
    }
  });

  // Confirm (handles both sign-up confirmation and MFA)
  fConfirm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = String(new FormData(fConfirm).get('code') || '').trim();

    try {
      // MFA path: we set a flag when we detect a challenge on signIn
      if (fConfirm.dataset.mfa === 'true') {
        await confirmSignIn({ challengeResponse: code });
        delete fConfirm.dataset.mfa;
        delete fConfirm.dataset.mode;
        await updateRoleGatedUI();
        modal.close();
        toast('MFA confirmed, you are in!');
        return;
      }

      // Normal sign-up confirmation path
      const email = fConfirm.dataset.email;
      await confirmSignUp({ username: email, confirmationCode: code });
      delete fConfirm.dataset.mode;
      toast('Confirmed! You can log in now.');
      hide(fConfirm); show(fLogin);
    } catch (err) {
      console.error(err);
      toast('Confirmation failed', 'error');
    }
  });

  // Log In (v6 nextStep logic) — prefer EMAIL OTP every time
  fLogin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(fLogin);
    const email = String(d.get('email') || '').trim();
    const password = String(d.get('password') || '');

    try {
      const { nextStep } = await signIn({
        username: email,
        password,
        options: {
          // Hint Cognito to use password + email OTP as the flow
          authFlowType: 'USER_SRP_AUTH',
          preferredChallenge: 'EMAIL_OTP',
        },
      });

      switch (nextStep.signInStep) {
        case 'DONE': {
          // If pool is configured to require email OTP, this normally won't happen;
          // but if it does, just proceed.
          await updateRoleGatedUI();
          modal.close();
          toast('Logged in!');
          break;
        }

        case 'CONFIRM_SIGN_UP': {
          // User exists but hasn’t verified their email yet
          hide(fLogin); hide(fSignup); show(fConfirm);
          fConfirm.dataset.email = email;
          delete fConfirm.dataset.mfa;
          fConfirm.dataset.mode = 'signup';
          toast('Please enter the verification code we emailed you');
          break;
        }

        case 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE':
        case 'CONFIRM_SIGN_IN_WITH_SMS_CODE':
        case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE': {
          hide(fLogin); hide(fSignup); show(fConfirm);
          delete fConfirm.dataset.mode;
          fConfirm.dataset.mfa = 'true';
          toast('Enter the verification code');
          break;
        }

        case 'CONTINUE_SIGN_IN_WITH_MFA_SELECTION': {
          // Choose EMAIL if available
          const choice = nextStep.allowedMFATypes?.includes('EMAIL')
            ? 'EMAIL'
            : nextStep.allowedMFATypes?.[0];
          await confirmSignIn({ challengeResponse: choice });
          hide(fLogin); hide(fSignup); show(fConfirm);
          delete fConfirm.dataset.mode;
          fConfirm.dataset.mfa = 'true';
          toast('Enter the verification code');
          break;
        }

        case 'CONTINUE_SIGN_IN_WITH_FIRST_FACTOR_SELECTION': {
          // Select password as the first factor; Cognito will then challenge with EMAIL_OTP
          await confirmSignIn({ challengeResponse: 'PASSWORD_SRP' });
          hide(fLogin); hide(fSignup); show(fConfirm);
          delete fConfirm.dataset.mode;
          fConfirm.dataset.mfa = 'true';
          toast('Enter the verification code');
          break;
        }

        case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED': {
          toast('New password required (UI not implemented yet).', 'error');
          break;
        }

        default: {
          console.warn('Unhandled next step:', nextStep);
          toast('Additional step required; not implemented in UI.', 'error');
        }
      }
    } catch (err) {
      console.error(err);
      toast('Login failed', 'error');
    }
  });

  // Log out
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#logout-btn')) return;
    e.preventDefault();
    try { await signOut(); await updateRoleGatedUI(); toast('Logged out'); }
    catch (err) { console.error(err); toast('Logout failed', 'error'); }
  });

  // Initial gate
  updateRoleGatedUI();
}

// Run after DOM (and after your nav/auth partials load)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireAuth);
} else {
  wireAuth();
}
