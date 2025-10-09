import { Amplify } from "https://esm.sh/aws-amplify@6";
import {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  confirmSignIn,
  signIn,
  signOut,
  fetchAuthSession,
} from "https://esm.sh/aws-amplify@6/auth";
import { Hub } from "https://esm.sh/aws-amplify@6/utils";

Amplify.configure({
  Auth: {
    Cognito: {
      region: "us-east-2",
      userPoolId: "us-east-2_9oCzdeOZF",
      userPoolClientId: "6f4qoincbfm9g0lifod7q8nuhg",
      loginWith: { username: false, email: true, phone: false },
      signUpVerificationMethod: "code",
    },
  },
});

const AUTH_EVENT = "auth:changed";
function emitAuthChanged(detail = {}) {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail }));
}
export function onAuthChange(fn) {
  const handler = (e) => fn(e.detail || {});
  window.addEventListener(AUTH_EVENT, handler);
  return () => window.removeEventListener(AUTH_EVENT, handler);
}

Hub.listen("auth", ({ payload }) => {
  const { event } = payload || {};
  if (["signedIn", "signedOut", "tokenRefresh"].includes(event)) {
    emitAuthChanged({ event });
  }
});

async function signInAndEmit(args) {
  const r = await signIn(args);
  emitAuthChanged({ event: "signedIn" });
  return r;
}
async function signOutAndEmit() {
  await signOut();
  emitAuthChanged({ event: "signedOut" });
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
