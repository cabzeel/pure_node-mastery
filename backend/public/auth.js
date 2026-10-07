// public/auth.js

const form = document.getElementById('signup-form');
const loginForm = document.getElementById('login-form');
const BASE_URL = 'http://localhost:3000';

// ==========================================
// 1. BLENDED UI & VISUAL STATE HELPERS
// ==========================================

function clearErrors(targetForm) {
    const fieldErrors = targetForm.querySelectorAll('.field-error');
    fieldErrors.forEach(err => err.textContent = '');

    const inputs = targetForm.querySelectorAll('input');
    inputs.forEach(input => input.removeAttribute('aria-invalid'));

    const formError = targetForm.querySelector('#form-error');
    if (formError) {
        formError.textContent = '';
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
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', target.id);
        firstInvalid ??= input;
    }
    firstInvalid?.focus();
    return Boolean(firstInvalid);
}

function showFormError(targetForm, message) {
    const el = targetForm.querySelector('#form-error');
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
// 2. SIGNUP LOGIC ENGINE
// ==========================================
if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors(form);

        const formData = new FormData(e.target);
        const formValues = Object.fromEntries(formData.entries());

        if (formValues.password !== formValues.confirmPassword) {
            showFieldErrors(form, { confirmPassword: "Passwords do not match." });
            return;
        }

        try {
            setLoading(form, true, 'Creating account…');

            const response = await fetch(`${BASE_URL}/api/signup`, {
                method: 'POST',
                headers: {
                    'content-type' : 'application/json',
                    'accept' : 'application/json'
                },
                body: JSON.stringify(formValues)
            });

            const result = await response.json();

            if (!response.ok) {
                if (result.errors) {
                    showFieldErrors(form, result.errors);
                } else {
                    showFormError(form, result.msg || `Server error: ${response.status}`);
                }
                setLoading(form, false);
                return;
            }

            console.log('Success:', result);
            form.reset();
            setLoading(form, false);
            
            if (result.user.token) {
                window.location.assign(`dashboard.html?token=${result.token}`);
            } else {
                window.location.assign('login.html?registered=1');
            }

        } catch (networkError) {
            console.error('Submission transaction failed:', networkError);
            showFormError(form, 'Could not connect to the server. Check your connection.');
            setLoading(form, false);
        }
    });
}

// ==========================================
// 3. LOGIN LOGIC ENGINE
// ==========================================
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors(loginForm);

        const formData = new FormData(e.target);
        const formValues = Object.fromEntries(formData.entries());

        try {
            setLoading(loginForm, true, 'Logging in…');

            const response = await fetch(`${BASE_URL}/api/login`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'accept': 'application/json'
                },
                body: JSON.stringify(formValues)
            });

            const result = await response.json();

            if (!response.ok) {
                if (result.errors) {
                    showFieldErrors(loginForm, result.errors);
                } else {
                    showFormError(loginForm, result.msg || 'Login failed.');
                }
                setLoading(loginForm, false);
                return;
            }

            console.log('Login Success:', result);
            loginForm.reset();
            setLoading(loginForm, false);

            window.location.assign(`dashboard.html?token=${result.token}`);

        } catch (networkError) {
            console.error('Login connection transaction failed:', networkError);
            showFormError(loginForm, 'Could not reach the server. Please verify your connection.');
            setLoading(loginForm, false);
        }
    });
}

// ==========================================
// 4. SECURE INTERFACE INITIALIZERS & PROFILE FETCHING
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    
    // Check if the current page body layout targets the dashboard
    if (document.body.dataset.page === 'dashboard') {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');

        if (token) {
            try {
                // Fetch the custom server-side data payload
                const response = await fetch(`${BASE_URL}/api/user/profile?token=${token}`, {
                    method: 'GET',
                    headers: { 'accept': 'application/json' }
                });

                if (response.ok) {
                    const profile = await response.json();
                    
                    // Dynamically map values directly onto your HTML template layout nodes
                    const greeting = document.getElementById('greeting');
                    const userEmail = document.getElementById('user-email');
                    
                    if (greeting && profile.user?.name) {
                        // Greets them by their first name string segment
                        greeting.textContent = `Hello, ${profile.user.name.split(' ')[0]}.`;
                    }
                    if (userEmail && profile.user?.email) {
                        userEmail.textContent = profile.user.email;
                    }
                }
            } catch (error) {
                console.error('Failed to parse dynamic dashboard parameters:', error);
            }
        }
    }

    // Password fields text type reveal/hide triggers
    document.querySelectorAll('[data-toggle-password]').forEach((button) => {
        const input = document.getElementById(button.dataset.togglePassword);
        if (!input) return;
        button.addEventListener('click', () => {
            const reveal = input.type === 'password';
            input.type = reveal ? 'text' : 'password';
            button.textContent = reveal ? 'Hide' : 'Show';
        });
    });

    // Dynamic asynchronous logout action execution pipeline
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();

            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');

            if (!token) {
                window.location.assign('login.html');
                return;
            }

            try {
                await fetch(`${BASE_URL}/api/logout?token=${token}`, {
                    method: 'POST',
                    headers: { 'accept': 'application/json' }
                });
            } catch (networkError) {
                console.error('Logout request failed to reach server:', networkError);
            }

            window.location.assign('login.html');
        });
    }
});
