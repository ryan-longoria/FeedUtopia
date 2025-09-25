// auth-esm.js
// ESM Amplify v6 – modular 'auth' APIs; resilient to duplicate script loads

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

// -----------------------------
// One-time guards
// -----------------------------
if (!window.__WU_AMPLIFY_CONFIGURED__) {
  window.__WU_AMPLIFY_CONFIGURED__ = true;
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
} else {
  console.debug('[auth] Amplify already configured; skipping');
}

if (window.__WU_AUTH_INITED__) {
  console.debug('[auth] init already ran; skipping duplicate init');
} else {
  window.__WU_AUTH_INITED__ = true;

  // -----------------------------
  // Utilities
  // -----------------------------
  function toast(text, type = 'success') {
    const t = document.querySelector('#toast');
    if (!t) {
      if (type === 'error') console.error(text);
      else console.log(text);
      return;
    }
    t.textContent = text;
    t.classList.toggle('error', type === 'error');
    t.style.display = 'block';
    setTimeout(() => (t.style.display = 'none'), 2600);
  }

  function show(el) { el && el.classList.remove('hidden'); }
  function hide(el) { el && el.classList.add('hidden'); }

  function waitForElement(sel, { timeout = 10000 } = {}) {
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

  function parseJwtPayload(jwt) {
    try {
      const payload = JSON.parse(atob(jwt.split('.')[1]));
      return payload || {};
    } catch { return {}; }
  }

  async function getGroups() {
    try {
      const session = await fetchAuthSession();
      const id = session?.tokens?.idToken?.toString();
      if (!id) return [];
      const payload = parseJwtPayload(id);
      return payload['cognito:groups'] || [];
    } catch { return []; }
  }

  async function updateRoleGatedUI() {
    const groups = await getGroups();
    const isSignedIn = !!groups || (await fetchAuthSession().catch(() => null))?.tokens;
    document.querySelectorAll('[data-auth="in"]').forEach(el => el.style.display = isSignedIn ? '' : 'none');
    document.querySelectorAll('[data-auth="out"]').forEach(el => el.style.display = isSignedIn ? 'none' : '');
    const isPromoter = Array.isArray(groups) && groups.includes('Promoters');
    document.querySelectorAll('[data-requires="promoter"]').forEach(el => el.style.display = isPromoter ? '' : 'none');
  }

  // Helpful error mapper for cleaner messages
  function mapAuthError(err) {
    const code = err?.name || err?.code || '';
    const msg = (err?.message || err?.toString?.() || '').replace(/^Error:\s*/,'');
    switch (code) {
      case 'UserNotFoundException': return 'No account found for that email.';
      case 'NotAuthorizedException': return 'Incorrect email or password.';
      case 'UserNotConfirmedException': return 'Please verify your email to continue.';
      case 'LimitExceededException': return 'Too many attempts. Please wait a bit and try again.';
      case 'CodeMismatchException': return 'That code didn’t match. Double-check and try again.';
      case 'ExpiredCodeException': return 'That code expired. Please request a new one.';
      case 'InvalidParameterException': return 'Invalid input. Please review the form.';
      case 'InvalidPasswordException': return 'Password doesn’t meet the requirements.';
      case 'TooManyRequestsException': return 'Too many requests right now. Try again shortly.';
      default: return msg || 'Something went wrong. Please try again.';
    }
  }

  // -----------------------------
  // Core wiring
  // -----------------------------
  async function wireAuth() {
    await waitForElement('#auth-modal').catch(() => {});
    const allModals = document.querySelectorAll('#auth-modal');
    if (allModals.length > 1) {
      console.warn('[auth] Multiple #auth-modal elements found; using the first.');
    }
    const modal = allModals[0];
    if (!modal) {
      console.warn('[auth] #auth-modal not found; nothing to wire.');
      return;
    }

    const fLogin   = modal.querySelector('#form-login');
    const fSignup  = modal.querySelector('#form-signup');
    const fConfirm = modal.querySelector('#form-confirm');
    const tabLogin  = modal.querySelector('#tab-login');
    const tabSignup = modal.querySelector('#tab-signup');
    const btnClose  = modal.querySelector('#auth-close');
    const btnResend = modal.querySelector('#resend-code');

    // in-flight locks to avoid duplicate calls/rate limits
    let loginInflight = false;
    let signupInflight = false;
    let confirmInflight = false;

    // Open modal from nav
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('#login-btn, .wu-login');
      if (!trigger) return;
      e.preventDefault();
      hide(fSignup); hide(fConfirm); show(fLogin);
      tabLogin?.setAttribute('aria-selected', 'true');
      tabSignup?.setAttribute('aria-selected', 'false');
      // Clear form fields and previous state on open
      fLogin?.reset(); fSignup?.reset(); fConfirm?.reset();
      delete fConfirm?.dataset.email;
      delete fConfirm?.dataset.mfa;
      delete fConfirm?.dataset.mode;
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

    // -----------------------------
    // Sign Up
    // -----------------------------
    fSignup?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (signupInflight) return;
      signupInflight = true;

      const d = new FormData(fSignup);
      const rawEmail = String(d.get('email') || '').trim();
      const email = rawEmail.toLowerCase();
      const password = String(d.get('password') || '');
      const role = String(d.get('role') || 'Wrestler');

      try {
        await signUp({
          username: email,
          password,
          options: {
            userAttributes: {
              email,
              'custom:role': role
            },
          }
        });

        // Move to confirm screen
        hide(fSignup); hide(fLogin); show(fConfirm);
        fConfirm.dataset.email = email;
        delete fConfirm.dataset.mfa;
        fConfirm.dataset.mode = 'signup';
        fConfirm.reset();
        toast('We emailed you a confirmation code');
      } catch (err) {
        console.error('[auth] signUp error', err);
        toast(mapAuthError(err), 'error');
      } finally {
        signupInflight = false;
      }
    });

    // Resend sign-up code
    btnResend?.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = fConfirm.dataset.email;
      if (!email) return toast('No email available to resend to.', 'error');
      try {
        await resendSignUpCode({ username: email });
        toast('Verification code resent');
      } catch (err) {
        console.error('[auth] resendSignUpCode error', err);
        toast(mapAuthError(err), 'error');
      }
    });

    // -----------------------------
    // Confirm (sign-up & MFA)
    // -----------------------------
    fConfirm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (confirmInflight) return;
      confirmInflight = true;

      const code = String(new FormData(fConfirm).get('code') || '').trim();

      try {
        if (fConfirm.dataset.mfa === 'true') {
          // MFA challenge response
          await confirmSignIn({ challengeResponse: code });
          delete fConfirm.dataset.mfa;
          delete fConfirm.dataset.mode;
          await updateRoleGatedUI();
          modal.close();
          toast('Verification successful — you are in!');
          return;
        }

        // Sign-up confirmation
        const email = fConfirm.dataset.email;
        if (!email) throw new Error('Missing email for confirmation');
        await confirmSignUp({ username: email, confirmationCode: code });
        delete fConfirm.dataset.mode;
        toast('Email confirmed! You can log in now.');
        hide(fConfirm); show(fLogin);
      } catch (err) {
        console.error('[auth] confirm error', err);
        toast(mapAuthError(err), 'error');
      } finally {
        confirmInflight = false;
      }
    });

    // -----------------------------
    // Log In – prefer EMAIL OTP
    // -----------------------------
    fLogin?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (loginInflight) return;
      loginInflight = true;

      const d = new FormData(fLogin);
      const rawEmail = String(d.get('email') || '').trim();
      const email = rawEmail.toLowerCase();
      const password = String(d.get('password') || '');

      try {
        const { nextStep } = await signIn({
          username: email,
          password,
          options: {
            // SRP + prefer email code for the challenge
            authFlowType: 'USER_SRP_AUTH',
            preferredChallenge: 'EMAIL_OTP',
          },
        });

        switch (nextStep.signInStep) {
          case 'DONE': {
            await updateRoleGatedUI();
            modal.close();
            toast('Logged in!');
            break;
          }

          case 'CONFIRM_SIGN_UP': {
            // not confirmed yet → push to confirm UI
            hide(fLogin); hide(fSignup); show(fConfirm);
            fConfirm.dataset.email = email;
            delete fConfirm.dataset.mfa;
            fConfirm.dataset.mode = 'signup';
            fConfirm.reset();
            toast('Please enter the verification code we emailed you');
            break;
          }

          case 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE':
          case 'CONFIRM_SIGN_IN_WITH_SMS_CODE':
          case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE': {
            // Challenge is active; ask for code
            hide(fLogin); hide(fSignup); show(fConfirm);
            delete fConfirm.dataset.mode;
            fConfirm.dataset.mfa = 'true';
            fConfirm.reset();
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
            fConfirm.reset();
            toast('Enter the verification code');
            break;
          }

          case 'CONTINUE_SIGN_IN_WITH_FIRST_FACTOR_SELECTION': {
            // Select password as first factor; Cognito will then push EMAIL_OTP
            await confirmSignIn({ challengeResponse: 'PASSWORD_SRP' });
            hide(fLogin); hide(fSignup); show(fConfirm);
            delete fConfirm.dataset.mode;
            fConfirm.dataset.mfa = 'true';
            fConfirm.reset();
            toast('Enter the verification code');
            break;
          }

          case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED': {
            // Pool might require reset on first login
            toast('New password required by the pool. This UI is not implemented yet.', 'error');
            break;
          }

          default: {
            console.warn('[auth] Unhandled next step:', nextStep);
            toast('Additional verification step required; not implemented in UI.', 'error');
          }
        }
      } catch (err) {
        console.error('[auth] signIn error', err);
        toast(mapAuthError(err), 'error');
      } finally {
        loginInflight = false;
      }
    });

    // -----------------------------
    // Log out
    // -----------------------------
    document.addEventListener('click', async (e) => {
      const btn = e.target.closest('#logout-btn');
      if (!btn) return;
      e.preventDefault();
      try {
        await signOut();
        await updateRoleGatedUI();
        toast('Logged out');
      } catch (err) {
        console.error('[auth] signOut error', err);
        toast('Logout failed', 'error');
      }
    });

    // initial gate
    updateRoleGatedUI();
  }

  // Run after DOM (and after your nav/auth partials load)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireAuth);
  } else {
    wireAuth();
  }
}
