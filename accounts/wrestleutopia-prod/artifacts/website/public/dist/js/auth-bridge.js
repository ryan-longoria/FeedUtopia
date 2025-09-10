import { Amplify } from 'https://esm.sh/aws-amplify@6';
import {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  confirmSignIn,
  signOut,
  fetchAuthSession,
} from 'https://esm.sh/aws-amplify@6/auth';

Amplify.configure({
  Auth: {
    Cognito: {
      region: 'us-east-2',
      userPoolId: 'us-east-2_9oCzdeOZF',
      userPoolClientId: '6f4qoincbfm9g0lifod7q8nuhg',
      loginWith: { username: false, email: true, phone: false },
      signUpVerificationMethod: 'code',
    },
  },
});

export {
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signIn,
  confirmSignIn,
  signOut,
  fetchAuthSession,
};