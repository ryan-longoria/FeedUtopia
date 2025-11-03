import {
  signIn,
  confirmSignIn,
  signUp,
  confirmSignUp,
  resendSignUpCode,
  signOut,
} from "/js/auth-bridge.js";

if (window._wuAuthWired) {
  console.debug("[auth] already wired, skipping");
} else {
  window._wuAuthWired = true;

  const dlg = document.getElementById("auth-modal");
  const tabLogin = document.getElementById("tab-login");
  const tabSignup = document.getElementById("tab-signup");
  const fLogin = document.getElementById("form-login");
  const fSignup = document.getElementById("form-signup");
  const fConfirm = document.getElementById("form-confirm");

  const roleSel = document.getElementById("signup-role");
  const wf = document.getElementById("wrestler-fields");
  const pf = document.getElementById("promoter-fields");

  const countrySel = document.getElementById("signup-country");
  const regionSel  = document.getElementById("signup-region");
  const citySel    = document.getElementById("signup-city");

  const GEO = {
    countries: [
      { code: "US", name: "United States" },
      { code: "CA", name: "Canada" },
      { code: "MX", name: "Mexico" },
    ],
    regionsByCountry: {
      US: [
        { code: "TX", name: "Texas" },
        { code: "CA", name: "California" },
        { code: "NY", name: "New York" },
      ],
      CA: [
        { code: "ON", name: "Ontario" },
        { code: "QC", name: "Quebec" },
        { code: "BC", name: "British Columbia" },
      ],
      MX: [
        { code: "CMX", name: "Ciudad de México" },
        { code: "JAL", name: "Jalisco" },
        { code: "NLE", name: "Nuevo León" },
      ],
    },
    citiesByRegion: {
      US: {
        TX: ["San Antonio", "Austin", "Houston", "Dallas"],
        CA: ["Los Angeles", "San Francisco", "San Diego"],
        NY: ["New York", "Buffalo", "Rochester"],
      },
      CA: {
        ON: ["Toronto", "Ottawa", "Hamilton"],
        QC: ["Montreal", "Quebec City", "Laval"],
        BC: ["Vancouver", "Victoria", "Burnaby"],
      },
      MX: {
        CMX: ["Mexico City"],
        JAL: ["Guadalajara", "Zapopan"],
        NLE: ["Monterrey", "San Nicolás"],
      },
    },
  };

  function resetSel(sel, placeholder, disabled = false) {
    if (!sel) return;
    sel.innerHTML = `<option value="">${placeholder}</option>`;
    sel.disabled = !!disabled;
  }

  function populateCountries() {
    if (!countrySel) return;
    resetSel(countrySel, "Select Country");
    GEO.countries.forEach(({ code, name }) => {
      const opt = document.createElement("option");
      opt.value = code; opt.textContent = name;
      countrySel.appendChild(opt);
    });
  }

  function populateRegions(countryCode) {
    if (!regionSel || !citySel) return;
    resetSel(regionSel, "Select State/Region", !countryCode);
    resetSel(citySel,   "Select City",        true);
    if (!countryCode) return;
    const regions = GEO.regionsByCountry[countryCode] || [];
    regions.forEach(({ code, name }) => {
      const opt = document.createElement("option");
      opt.value = code; opt.textContent = name;
      regionSel.appendChild(opt);
    });
    regionSel.disabled = regions.length === 0;
  }

  function populateCities(countryCode, regionCode) {
    if (!citySel) return;
    resetSel(citySel, "Select City", !countryCode || !regionCode);
    if (!countryCode || !regionCode) return;
    const cities = GEO.citiesByRegion[countryCode]?.[regionCode] || [];
    cities.forEach((name) => {
      const opt = document.createElement("option");
      opt.value = name; opt.textContent = name;
      citySel.appendChild(opt);
    });
    citySel.disabled = cities.length === 0;
  }

  function initGeoIfNeeded() {
    if (countrySel && countrySel.options.length <= 1) {
      populateCountries();
      populateRegions("");
      populateCities("", "");
    }
  }

  countrySel?.addEventListener("change", () => {
    populateRegions(countrySel.value);
  });
  regionSel?.addEventListener("change", () => {
    populateCities(countrySel.value, regionSel.value);
  });

  let signupEmailForConfirm = "";
  let signupPasswordCache = "";
  let submitLock = false;
  const withSubmitLock =
    (fn) =>
    async (...args) => {
      if (submitLock) return;
      try {
        submitLock = true;
        await fn(...args);
      } finally {
        submitLock = false;
      }
    };

  const show = (el) => el && el.classList.remove("hidden");
  const hide = (el) => el && el.classList.add("hidden");
  const toast = (msg) => {
    try { alert(msg); } catch {}
  };

  function showLogin() {
    tabLogin?.setAttribute("aria-selected", "true");
    tabSignup?.setAttribute("aria-selected", "false");
    show(fLogin);
    hide(fSignup);
    hide(fConfirm);
  }

  function showSignup(intentRole) {
    tabLogin?.setAttribute("aria-selected", "false");
    tabSignup?.setAttribute("aria-selected", "true");
    hide(fLogin);
    show(fSignup);
    hide(fConfirm);
    if (intentRole === "promoter") roleSel.value = "Promoter";
    if (intentRole === "wrestler") roleSel.value = "Wrestler";
    onRoleChange();
    initGeoIfNeeded();
  }

  window.authShowLogin = showLogin;
  window.authShowSignup = showSignup;

  function showConfirmFor(email, { mode } = {}) {
    signupEmailForConfirm = email || signupEmailForConfirm || "";
    if (!signupEmailForConfirm) {
      toast("We need your email to confirm. Please sign up or log in again.");
      showSignup();
      return;
    }
    hide(fLogin);
    hide(fSignup);
    show(fConfirm);
    fConfirm.dataset.mode = mode || "";
  }

  function onRoleChange() {
    if (!roleSel || !wf || !pf) return;
    const isW = roleSel.value === "Wrestler";
    wf.classList.toggle("hidden", !isW);
    pf.classList.toggle("hidden", isW);

    wf.querySelectorAll("input,select").forEach((i) => (i.required = isW));
    pf.querySelectorAll("input,select").forEach((i) => (i.required = !isW));

    if (isW) {
      initGeoIfNeeded();
    } else {
      resetSel(countrySel, "Select Country", true);
      resetSel(regionSel,  "Select State/Region", true);
      resetSel(citySel,    "Select City", true);
    }
  }

  roleSel?.addEventListener("change", onRoleChange);
  onRoleChange();

  tabLogin?.addEventListener("click", showLogin);
  tabSignup?.addEventListener("click", () => showSignup());

  document.getElementById("auth-close")?.addEventListener("click", () => {
    dlg.close();
    signupEmailForConfirm = "";
    signupPasswordCache = "";
    fConfirm?.reset?.();
  });

  window.addEventListener("auth:open", (e) => {
    dlg.showModal();
    const intent = (e?.detail?.intent || "").toString().toLowerCase();
    if (intent === "promoter" || intent === "wrestler") showSignup(intent);
    else showLogin();
  });

  document.getElementById("login-btn")?.addEventListener("click", (e) => {
    e.preventDefault();
    dlg.showModal();
    showLogin();
  });

  fSignup?.addEventListener(
    "submit",
    withSubmitLock(async (e) => {
      e.preventDefault();
      const fd = new FormData(fSignup);
      const email = String(fd.get("email") || "").trim();
      const password = String(fd.get("password") || "");
      const role = String(fd.get("role") || "Wrestler");

      const isW = role === "Wrestler";

      const ua = {
        email,
        "custom:role": role,
      };

      if (isW) {
        const given = String(fd.get("given_name") || "").trim();
        const family = String(fd.get("family_name") || "").trim();
        const stage = String(fd.get("stageName") || "").trim();
        const dob = String(fd.get("dob") || "").trim();

        // NOTE: These now come from <select> only
        const country = String(fd.get("country") || "").trim();
        const region  = String(fd.get("region") || "").trim();
        const city    = String(fd.get("city") || "").trim();

        Object.assign(ua, {
          given_name: given,
          family_name: family,
          "custom:stageName": stage,
          "custom:dob": dob,
          "custom:city": city,
          "custom:region": region,
          "custom:country": country,
        });
      } else {
        const orgName = String(fd.get("orgName") || "").trim();
        const address = String(fd.get("address") || "").trim();
        if (orgName) ua["custom:orgName"] = orgName;
        if (address) ua["custom:address"] = address;
      }

      try {
        await signUp({
          username: email,
          password,
          options: { userAttributes: ua },
        });

        signupEmailForConfirm = email;
        signupPasswordCache = password;

        showConfirmFor(email, { mode: "signup" });
        toast("We emailed you a verification code.");
      } catch (err) {
        console.error("[auth] signUp error", err);
        const msg =
          err?.name === "UsernameExistsException"
            ? "An account with this email already exists."
            : err?.message || "Sign up failed";
        toast(msg);
      }
    }),
  );

  document.getElementById("resend-code")?.addEventListener(
    "click",
    withSubmitLock(async () => {
      if (!signupEmailForConfirm) {
        toast("Open the Create Account tab and enter your email first.");
        showSignup();
        return;
      }
      try {
        await resendSignUpCode({ username: signupEmailForConfirm });
        toast("Verification code resent.");
      } catch (err) {
        console.error("[auth] resendSignUpCode error", err);
        toast(err?.message || "Could not resend code.");
      }
    }),
  );

  fConfirm?.addEventListener(
    "submit",
    withSubmitLock(async (e) => {
      e.preventDefault();
      const code = String(new FormData(fConfirm).get("code") || "").trim();

      if (fConfirm.dataset.mfa === "true") {
        try {
          await confirmSignIn({ challengeResponse: code });
          fConfirm.dataset.mfa = "";
          dlg.close();
          toast("You are signed in.");
          return;
        } catch (err) {
          console.error("[auth] confirmSignIn error", err);
          toast(err?.message || "MFA confirmation failed.");
          return;
        }
      }

      if (!signupEmailForConfirm) {
        toast("We lost the email for confirmation; please sign up or log in again.");
        showSignup();
        return;
      }
      try {
        await confirmSignUp({
          username: signupEmailForConfirm,
          confirmationCode: code,
        });
        toast("Email confirmed! Signing you in…");

        if (signupPasswordCache) {
          try {
            await signIn({
              username: signupEmailForConfirm,
              password: signupPasswordCache,
              options: {
                authFlowType: "USER_SRP_AUTH",
                preferredChallenge: "EMAIL_OTP",
              },
            });
          } catch (e2) {}
        }
        dlg.close();
      } catch (err) {
        console.error("[auth] confirmSignUp error", err);
        let m = err?.message || "Confirmation failed.";
        if (err?.name === "ExpiredCodeException") m = "Code expired. Click “Resend code”.";
        toast(m);
      }
    }),
  );

  fLogin?.addEventListener(
    "submit",
    withSubmitLock(async (e) => {
      e.preventDefault();
      const fd = new FormData(fLogin);
      const email = String(fd.get("email") || "").trim();
      const password = String(fd.get("password") || "");

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
          case "DONE": {
            dlg.close();
            toast("Logged in!");
            break;
          }
          case "CONFIRM_SIGN_UP": {
            showConfirmFor(email, { mode: "signup" });
            toast("Enter the verification code we just emailed you.");
            break;
          }
          case "CONTINUE_SIGN_IN_WITH_MFA_SELECTION": {
            const choice = nextStep.allowedMFATypes?.includes("EMAIL")
              ? "EMAIL"
              : nextStep.allowedMFATypes?.[0];
            await confirmSignIn({ challengeResponse: choice });
            showConfirmFor(email, { mode: "" });
            fConfirm.dataset.mfa = "true";
            toast("Enter the code we emailed you.");
            break;
          }
          case "CONFIRM_SIGN_IN_WITH_EMAIL_CODE":
          case "CONFIRM_SIGN_IN_WITH_SMS_CODE":
          case "CONFIRM_SIGN_IN_WITH_TOTP_CODE": {
            showConfirmFor(email, { mode: "" });
            fConfirm.dataset.mfa = "true";
            toast("Enter the code we emailed you.");
            break;
          }
          case "CONTINUE_SIGN_IN_WITH_FIRST_FACTOR_SELECTION": {
            await confirmSignIn({ challengeResponse: "PASSWORD_SRP" });
            showConfirmFor(email, { mode: "" });
            fConfirm.dataset.mfa = "true";
            toast("Enter the code we emailed you.");
            break;
          }
          case "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED": {
            toast("A new password is required (UI not implemented yet).");
            break;
          }
          default: {
            console.warn("[auth] unhandled nextStep", nextStep);
            toast("Additional verification required (not implemented).");
          }
        }
      } catch (err) {
        console.error("[auth] signIn error", err);
        let m = err?.message || "Login failed.";
        if (err?.name === "LimitExceededException")
          m = "Too many attempts. Please wait a minute and try again.";
        toast(m);
      }
    }),
  );

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("#logout-btn");
    if (!btn) return;
    e.preventDefault();
    try {
      await signOut();
      toast("Logged out.");
    } catch (err) {
      console.error("[auth] signOut error", err);
      toast("Logout failed.");
    }
  });
}
