// public/auth.js
// Everything for the signup + login pages lives in this one file: visual helpers, the shared
// request flow, signup, login and the password show/hide buttons.
// The dashboard has its own script (dashboard.js), so nothing about the dashboard lives here.

const form = document.getElementById("signup-form");
const loginForm = document.getElementById("login-form");
const BASE_URL = "http://localhost:3000";

// ==========================================
// 1. UI & VISUAL STATE HELPERS
// ==========================================

function clearErrors(targetForm) {
  const fieldErrors = targetForm.querySelectorAll(".field-error");
  fieldErrors.forEach((err) => (err.textContent = ""));

  const inputs = targetForm.querySelectorAll("input");
  inputs.forEach((input) => input.removeAttribute("aria-invalid"));

  const formError = targetForm.querySelector("#form-error");
  if (formError) {
    formError.textContent = "";
    formError.hidden = true;
  }
}

function showFieldErrors(targetForm, errors) {
  if (!errors) return false;
  let firstInvalid = null;
  for (const [name, message] of Object.entries(errors)) {
    const input = targetForm.elements[name];
    const target = targetForm.querySelector(`#${CSS.escape(name)}-error`);
    if (!input || !target) continue;
    target.textContent = String(message);
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", target.id);
    firstInvalid ??= input;
  }
  firstInvalid?.focus();
  return Boolean(firstInvalid);
}

function showFormError(targetForm, message) {
  const el = targetForm.querySelector("#form-error");
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

function setLoading(targetForm, isLoading, loadingLabel) {
  const button = targetForm.querySelector('button[type="submit"]');
  if (!button) return;
  if (isLoading) {
    button.dataset.label = button.textContent;
    button.textContent = loadingLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.label || button.textContent;
    button.disabled = false;
  }
}

// ==========================================
// 2. SHARED REQUEST FLOW (signup + login)
// ==========================================

// Send the form as JSON, show any errors, and run onSuccess(result) when the server says OK.
async function submitAuth(targetForm, { path, loadingLabel, failMessage, networkMessage, onSuccess }) {
  const values = Object.fromEntries(new FormData(targetForm).entries());

  try {
    setLoading(targetForm, true, loadingLabel);

    const response = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(values),
    });

    const result = await response.json();

    if (!response.ok) {
      if (result.errors) {
        showFieldErrors(targetForm, result.errors);
      } else {
        showFormError(
          targetForm,
          result.message || failMessage || `Server error: ${response.status}`,
        );
      }
      setLoading(targetForm, false);
      return;
    }

    targetForm.reset();
    setLoading(targetForm, false);
    onSuccess(result);
  } catch (networkError) {
    console.error("Request failed:", networkError);
    showFormError(targetForm, networkMessage);
    setLoading(targetForm, false);
  }
}

// The dashboard reads the token from sessionStorage and sends it in the Authorization header.
function startSession(token) {
  sessionStorage.setItem("token", token);
  window.location.assign("dashboard.html");
}

// ==========================================
// 3. SIGNUP
// ==========================================
if (form) {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(form);

    if (form.elements.password.value !== form.elements.confirmPassword.value) {
      showFieldErrors(form, { confirmPassword: "Passwords do not match." });
      return;
    }

    submitAuth(form, {
      path: "/api/signup",
      loadingLabel: "Creating account…",
      networkMessage: "Could not connect to the server. Check your connection.",
      onSuccess: (result) => {
        if (result.user?.token) startSession(result.user.token);
        else window.location.assign("login.html?registered=1");
      },
    });
  });
}

// ==========================================
// 4. LOGIN
// ==========================================
if (loginForm) {
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    clearErrors(loginForm);

    submitAuth(loginForm, {
      path: "/api/login",
      loadingLabel: "Logging in…",
      failMessage: "Login failed.",
      networkMessage: "Could not reach the server. Please verify your connection.",
      onSuccess: (result) => startSession(result.token),
    });
  });
}

// ==========================================
// 5. PASSWORD SHOW / HIDE BUTTONS
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    const input = document.getElementById(button.dataset.togglePassword);
    if (!input) return;
    button.addEventListener("click", () => {
      const reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      button.textContent = reveal ? "Hide" : "Show";
    });
  });
});