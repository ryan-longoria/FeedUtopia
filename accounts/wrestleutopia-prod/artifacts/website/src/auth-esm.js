// ESM Amplify v6 – modular 'auth' APIs
import { Amplify } from "aws-amplify";
import {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  confirmSignIn,
  signOut,
  fetchAuthSession,
} from "aws-amplify/auth";

// ==== CONFIG (put your real values) ====
const AWS_REGION = "us-east-2";
const USER_POOL_ID = "us-east-2_9oCzdeOZF";
const USER_POOL_CLIENT_ID = "6f4qoincbfm9g0lifod7q8nuhg";
// =======================================

Amplify.configure({
  Auth: {
    Cognito: {
      region: AWS_REGION,
      userPoolId: USER_POOL_ID,
      userPoolClientId: USER_POOL_CLIENT_ID,
      loginWith: { username: false, email: true, phone: false },
      signUpVerificationMethod: "code",
    },
  },
});

// ---------- small UI helpers ----------
function toast(text, type = "success") {
  const t = document.querySelector("#toast");
  if (!t) return console.log(`[toast:${type}]`, text);
  t.textContent = text;
  t.classList.toggle("error", type === "error");
  t.style.display = "block";
  setTimeout(() => (t.style.display = "none"), 2600);
}
const show = (el) => el && el.classList.remove("hidden");
const hide = (el) => el && el.classList.add("hidden");

// normalize 1999-9-8 -> 1999-09-08; validate YYYY-MM-DD
function normalizeDOB(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const yyyy = m[1];
  const mm = String(parseInt(m[2], 10)).padStart(2, "0");
  const dd = String(parseInt(m[3], 10)).padStart(2, "0");
  const iso = `${yyyy}-${mm}-${dd}`;
  // very light sanity check
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return iso;
}

async function waitForElement(sel, { timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const found = document.querySelector(sel);
    if (found) return resolve(found);
    const obs = new MutationObserver(() => {
      const el = document.querySelector(sel);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => {
      obs.disconnect();
      reject(new Error(`Timeout waiting for ${sel}`));
    }, timeout);
  });
}

async function getGroups() {
  try {
    const session = await fetchAuthSession();
    const id = session?.tokens?.idToken?.toString();
    if (!id) return [];
    const payload = JSON.parse(atob(id.split(".")[1]));
    return payload["cognito:groups"] || [];
  } catch {
    return [];
  }
}

async function updateRoleGatedUI() {
  const groups = await getGroups();
  const isSignedIn = !!(await fetchAuthSession().catch(() => null))?.tokens;
  document
    .querySelectorAll('[data-auth="in"]')
    .forEach((el) => (el.style.display = isSignedIn ? "" : "none"));
  document
    .querySelectorAll('[data-auth="out"]')
    .forEach((el) => (el.style.display = isSignedIn ? "none" : ""));
  const isPromoter = groups.includes("Promoters");
  document
    .querySelectorAll('[data-requires="promoter"]')
    .forEach((el) => (el.style.display = isPromoter ? "" : "none"));
}

// ---------- main wiring ----------
async function wireAuth() {
  await waitForElement("#auth-modal").catch(() => {});
  const modal = document.getElementById("auth-modal");
  if (!modal) return;

  // Forms + controls (your auth.html needs matching names/ids)
  const fLogin = modal.querySelector("#form-login");
  const fSignup = modal.querySelector("#form-signup");
  const fConfirm = modal.querySelector("#form-confirm");
  const tabLogin = modal.querySelector("#tab-login");
  const tabSignup = modal.querySelector("#tab-signup");
  const btnClose = modal.querySelector("#auth-close");
  const btnResend = modal.querySelector("#resend-code");

  // Open modal from nav
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("#login-btn, .wu-login");
    if (!trigger) return;
    e.preventDefault();
    hide(fSignup);
    hide(fConfirm);
    show(fLogin);
    tabLogin?.setAttribute("aria-selected", "true");
    tabSignup?.setAttribute("aria-selected", "false");
    modal.showModal();
  });

  btnClose?.addEventListener("click", () => modal.close());

  // Tabs
  tabLogin?.addEventListener("click", () => {
    hide(fSignup);
    hide(fConfirm);
    show(fLogin);
    tabLogin.setAttribute("aria-selected", "true");
    tabSignup.setAttribute("aria-selected", "false");
  });
  tabSignup?.addEventListener("click", () => {
    hide(fLogin);
    hide(fConfirm);
    show(fSignup);
    tabSignup.setAttribute("aria-selected", "true");
    tabLogin.setAttribute("aria-selected", "false");
  });

  // ------- SIGN UP -------
  fSignup?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const d = new FormData(fSignup);
    const email = String(d.get("email") || "").trim();
    const password = String(d.get("password") || "");
    const role = String(d.get("role") || "Wrestler").trim();

    // NEW required fields (these names must match your <input name="...">s)
    const first = String(d.get("first_name") || "").trim();
    const last = String(d.get("last_name") || "").trim();
    const stage = String(d.get("stage_name") || "").trim();
    const dobRaw = String(d.get("dob") || "").trim();
    const city = String(d.get("city") || "").trim();
    const region = String(d.get("region") || "").trim(); // state/province
    const country = String(d.get("country") || "").trim();

    const dob = normalizeDOB(dobRaw);
    if (!first || !last || !stage || !dob || !city || !region || !country) {
      toast("Please complete all fields (DOB must be YYYY-MM-DD).", "error");
      return;
    }

    try {
      const res = await signUp({
        username: email,
        password,
        options: {
          userAttributes: {
            email,
            given_name: first,
            family_name: last,
            "custom:stageName": stage,
            "custom:dob": dob,
            "custom:city": city,
            "custom:region": region,
            "custom:country": country,
            "custom:role": role,
          },
          // requesting an emailed confirmation code
          autoSignIn: false,
        },
      });

      console.debug("[auth] signUp ok", res);
      hide(fSignup);
      hide(fLogin);
      show(fConfirm);
      fConfirm.dataset.email = email;
      delete fConfirm.dataset.mfa;
      fConfirm.dataset.mode = "signup";
      toast("We emailed you a confirmation code");
    } catch (err) {
      console.error("[auth] signUp error", err);

      // If the user already exists but is unconfirmed, push them to confirm flow
      if (String(err?.name) === "UsernameExistsException") {
        hide(fSignup);
        hide(fLogin);
        show(fConfirm);
        fConfirm.dataset.email = email;
        fConfirm.dataset.mode = "signup";
        try {
          await resendSignUpCode({ username: email });
        } catch {}
        toast("Account exists. Enter the code we emailed you.");
        return;
      }

      if (String(err?.name) === "UserLambdaValidationException") {
        toast(err.message || "Sign-up validation failed", "error");
        return;
      }

      toast("Sign-up failed", "error");
    }
  });

  // Resend sign-up code
  btnResend?.addEventListener("click", async (e) => {
    e.preventDefault();
    const email = fConfirm.dataset.email;
    if (!email) return;
    try {
      await resendSignUpCode({ username: email });
      toast("Verification code resent");
    } catch (err) {
      console.error(err);
      toast("Could not resend code", "error");
    }
  });

  // ------- CONFIRM (sign-up confirm or MFA code entry) -------
  fConfirm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = String(new FormData(fConfirm).get("code") || "").trim();

    try {
      // MFA path
      if (fConfirm.dataset.mfa === "true") {
        await confirmSignIn({ challengeResponse: code });
        delete fConfirm.dataset.mfa;
        delete fConfirm.dataset.mode;
        await updateRoleGatedUI();
        toast("Code accepted. You are in!");
        modal.close();
        return;
      }

      // Sign-up email verification
      const email = fConfirm.dataset.email;
      await confirmSignUp({ username: email, confirmationCode: code });
      delete fConfirm.dataset.mode;
      toast("Email confirmed! Please log in.");
      hide(fConfirm);
      show(fLogin);
    } catch (err) {
      console.error(err);
      toast("Confirmation failed", "error");
    }
  });

  // ------- LOG IN -------
  fLogin?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const d = new FormData(fLogin);
    const email = String(d.get("email") || "").trim();
    const password = String(d.get("password") || "");

    try {
      const { nextStep } = await signIn({
        username: email,
        password,
        options: {
          authFlowType: "USER_SRP_AUTH",
          preferredChallenge: "EMAIL_OTP",
        },
      });

      switch (nextStep.signInStep) {
        case "DONE":
          await updateRoleGatedUI();
          toast("Logged in!");
          modal.close();
          break;

        case "CONFIRM_SIGN_UP":
          hide(fLogin);
          hide(fSignup);
          show(fConfirm);
          fConfirm.dataset.email = email;
          delete fConfirm.dataset.mfa;
          fConfirm.dataset.mode = "signup";
          toast("Please enter the verification code we emailed you");
          break;

        case "CONFIRM_SIGN_IN_WITH_EMAIL_CODE":
        case "CONFIRM_SIGN_IN_WITH_SMS_CODE":
        case "CONFIRM_SIGN_IN_WITH_TOTP_CODE":
          hide(fLogin);
          hide(fSignup);
          show(fConfirm);
          delete fConfirm.dataset.mode;
          fConfirm.dataset.mfa = "true";
          toast("Enter the verification code");
          break;

        case "CONTINUE_SIGN_IN_WITH_MFA_SELECTION": {
          const choice = nextStep.allowedMFATypes?.includes("EMAIL")
            ? "EMAIL"
            : nextStep.allowedMFATypes?.[0];
          await confirmSignIn({ challengeResponse: choice });
          hide(fLogin);
          hide(fSignup);
          show(fConfirm);
          delete fConfirm.dataset.mode;
          fConfirm.dataset.mfa = "true";
          toast("Enter the verification code");
          break;
        }

        case "CONTINUE_SIGN_IN_WITH_FIRST_FACTOR_SELECTION":
          await confirmSignIn({ challengeResponse: "PASSWORD_SRP" });
          hide(fLogin);
          hide(fSignup);
          show(fConfirm);
          delete fConfirm.dataset.mode;
          fConfirm.dataset.mfa = "true";
          toast("Enter the verification code");
          break;

        case "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED":
          toast("New password required (UI not implemented yet).", "error");
          break;

        default:
          console.warn("Unhandled next step:", nextStep);
          toast("Additional step required; not implemented in UI.", "error");
      }
    } catch (err) {
      console.error(err);
      toast("Login failed", "error");
    }
  });

  // Log out
  document.addEventListener("click", async (e) => {
    if (!e.target.closest("#logout-btn")) return;
    e.preventDefault();
    try {
      await signOut();
      await updateRoleGatedUI();
      toast("Logged out");
    } catch (err) {
      console.error(err);
      toast("Logout failed", "error");
    }
  });

  // Initial gate
  updateRoleGatedUI();
}

// Run after DOM
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", wireAuth);
} else {
  wireAuth();
}
