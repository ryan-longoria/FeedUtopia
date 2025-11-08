import { Amplify } from "https://esm.sh/aws-amplify@6";
import {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  confirmSignIn,
  signIn as amplifySignIn,
  signOut as amplifySignOut,
  fetchAuthSession,
} from "https://esm.sh/aws-amplify@6/auth";
import { Hub } from "https://esm.sh/aws-amplify@6/utils";

const CFG = {
  region: "us-east-2",
  userPoolId: "us-east-2_9oCzdeOZF",
  userPoolClientId: "6f4qoincbfm9g0lifod7q8nuhg",
  loginWith: { username: false, email: true, phone: false },
  signUpVerificationMethod: "code",
  storage: sessionStorage,
  maxRetries: 3,
};

const LOG_NS = "auth";
const redact = (v) => (typeof v === "string" ? v.replace(/[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g, "[jwt]") : v);
const log = (level, msg, extra = {}) => {
  const safe = Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, redact(String(v))]));
  console[level]?.(`[${LOG_NS}] ${msg}`, safe);
};

Amplify.configure({
  Auth: {
    Cognito: {
      region: CFG.region,
      userPoolId: CFG.userPoolId,
      userPoolClientId: CFG.userPoolClientId,
      loginWith: CFG.loginWith,
      signUpVerificationMethod: CFG.signUpVerificationMethod,
    },
  },
  Storage: {
    customizedStorage: {
      getItem: (k) => CFG.storage.getItem(k),
      setItem: (k, v) => CFG.storage.setItem(k, v),
      removeItem: (k) => CFG.storage.removeItem(k),
      clear: () => CFG.storage.clear(),
      key: (i) => CFG.storage.key(i),
      length: CFG.storage.length,
    },
  },
});

const AUTH_EVENT = "auth:changed";
const emit = (type, detail = {}) => {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail: { type, ...detail } }));
};
export function onAuthChange(fn) {
  const handler = (e) => fn(e.detail || {});
  window.addEventListener(AUTH_EVENT, handler);
  return () => window.removeEventListener(AUTH_EVENT, handler);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withBackoff(fn) {
  let attempt = 0;
  let delay = 250;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      if (attempt > CFG.maxRetries) throw err;
      await sleep(delay + Math.floor(Math.random() * 150));
      delay *= 2;
    }
  }
}
function sessionSignedIn(session) {
  return Boolean(session?.tokens?.idToken);
}

Hub.listen("auth", ({ payload }) => {
  const event = payload?.event;
  switch (event) {
    case "signedIn":
      emit("signedIn");
      log("info", "signedIn");
      break;
    case "signedOut":
      emit("signedOut");
      log("info", "signedOut");
      break;
    case "tokenRefresh":
      emit("tokenRefreshed");
      break;
    case "tokenRefresh_failure":
      log("warn", "tokenRefresh_failure");
      amplifySignOut().catch(() => {});
      emit("signedOut");
      break;
    default:
      break;
  }
});

async function signInAndEmit(args) {
  const r = await withBackoff(() => amplifySignIn(args));
  const step = r?.nextStep?.signInStep;
  if (!step || step === "DONE") {
    emit("signedIn");
  } else {
    const map = {
      CONFIRM_SIGN_UP: "confirmSignUpRequired",
      CONFIRM_SIGN_IN_WITH_SMS_CODE: "mfaRequired",
      CONFIRM_SIGN_IN_WITH_TOTP_CODE: "totpRequired",
      RESET_PASSWORD: "resetPasswordRequired",
      CONTINUE_SIGN_IN_WITH_TOTP_SETUP: "totpSetupRequired",
      CONTINUE_SIGN_IN_WITH_MFA_SELECTION: "mfaSelectionRequired",
    };
    emit(map[step] || "signInNextStep", { step });
  }
  return r;
}
async function signOutAndEmit() {
  await amplifySignOut();
  emit("signedOut");
}

export {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  confirmSignIn,
  fetchAuthSession,
  signInAndEmit as signIn,
  signOutAndEmit as signOut,
};

(async () => {
  try {
    const session = await withBackoff(() => fetchAuthSession());
    const signedIn = sessionSignedIn(session);
    emit("initial", { status: signedIn ? "signedIn" : "signedOut" });
  } catch (err) {
    log("warn", "initial session fetch failed", { err: String(err?.name || err) });
    emit("initial", { status: "signedOut" });
  }
})();
