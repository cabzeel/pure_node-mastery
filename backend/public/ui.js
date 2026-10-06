/**
 * UI & Presentation Layer Only
 * This code does nothing but update the visual state of elements in the DOM.
 */
(() => {
  'use strict';

  // 1. Clears visual error text messages and styles from inputs
 

  // 2. Injects individual error strings into target text containers next to inputs
  window.showFieldErrors = function(form, errors) {
    let firstInvalid = null;
    for (const [name, message] of Object.entries(errors)) {
      const input = form.elements[name];
      const target = form.querySelector(`#${CSS.escape(name)}-error`);
      if (!input || !target) continue;
      target.textContent = String(message);
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', target.id);
      firstInvalid ??= input;
    }
    firstInvalid?.focus();
    return Boolean(firstInvalid);
  };

  // 3. Displays a global form error block (e.g. "Network error, please try again")
  window.showFormError = function(form, message) {
    const el = form.querySelector('#form-error');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  };

  // 4. Changes the submit button text and disables it while processing
  window.setLoading = function(form, isLoading, loadingLabel) {
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    if (isLoading) {
      button.dataset.label = button.textContent;
      button.textContent = loadingLabel;
      button.disabled = true;
    } else {
      button.textContent = button.dataset.label || button.textContent;
      button.disabled = false;
    }
  };

  // 5. Switches input types between 'password' and 'text' to show/hide letters
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-toggle-password]').forEach((button) => {
      const input = document.getElementById(button.dataset.togglePassword);
      if (!input) return;
      button.addEventListener('click', () => {
        const reveal = input.type === 'password';
        input.type = reveal ? 'text' : 'password';
        button.textContent = reveal ? 'Hide' : 'Show';
      });
    });
  });
})();
