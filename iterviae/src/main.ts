import "./styles.css";
import { AuthService } from "./auth";

console.log("Iter Viae Web App initialized with Directus Auth Service.");

// DOM Element References
const launchBtn = document.getElementById("launch-app-btn");
const serverStatusBtn = document.getElementById("server-status-btn");
const openAuthBtn = document.getElementById("open-auth-btn");
const authModal = document.getElementById("auth-modal");
const authModalClose = document.getElementById("auth-modal-close");

const tabLoginBtn = document.getElementById("tab-login-btn");
const tabRegisterBtn = document.getElementById("tab-register-btn");

const loginForm = document.getElementById("login-form") as HTMLFormElement;
const registerForm = document.getElementById("register-form") as HTMLFormElement;
const authErrorBanner = document.getElementById("auth-error-banner");

const userSessionPill = document.getElementById("user-session-pill");
const userDisplayName = document.getElementById("user-display-name");
const logoutBtn = document.getElementById("logout-btn");

// UI State Updates
function updateAuthStateUI() {
  const user = AuthService.getUser();
  if (user) {
    if (openAuthBtn) openAuthBtn.style.display = "none";
    if (userSessionPill) userSessionPill.style.display = "flex";
    if (userDisplayName) {
      userDisplayName.textContent = user.first_name || user.email;
    }
  } else {
    if (openAuthBtn) openAuthBtn.style.display = "inline-flex";
    if (userSessionPill) userSessionPill.style.display = "none";
  }
}

// Modal Handlers
function openModal() {
  if (authModal) authModal.style.display = "flex";
  if (authErrorBanner) authErrorBanner.style.display = "none";
}

function closeModal() {
  if (authModal) authModal.style.display = "none";
}

if (openAuthBtn) openAuthBtn.addEventListener("click", openModal);
if (authModalClose) authModalClose.addEventListener("click", closeModal);

// Tab Switching Handlers
if (tabLoginBtn && tabRegisterBtn && loginForm && registerForm) {
  tabLoginBtn.addEventListener("click", () => {
    tabLoginBtn.classList.add("active");
    tabRegisterBtn.classList.remove("active");
    loginForm.style.display = "flex";
    registerForm.style.display = "none";
    if (authErrorBanner) authErrorBanner.style.display = "none";
  });

  tabRegisterBtn.addEventListener("click", () => {
    tabRegisterBtn.classList.add("active");
    tabLoginBtn.classList.remove("active");
    registerForm.style.display = "flex";
    loginForm.style.display = "none";
    if (authErrorBanner) authErrorBanner.style.display = "none";
  });
}

// Login Form Submit
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById("login-email") as HTMLInputElement;
    const passwordInput = document.getElementById("login-password") as HTMLInputElement;

    try {
      if (authErrorBanner) authErrorBanner.style.display = "none";
      const user = await AuthService.login(emailInput.value, passwordInput.value);
      updateAuthStateUI();
      closeModal();
      alert(`Welcome back, ${user.first_name || user.email}! Authenticated via Directus.`);
    } catch (err: any) {
      if (authErrorBanner) {
        authErrorBanner.textContent = err.message || "Authentication failed.";
        authErrorBanner.style.display = "block";
      }
    }
  });
}

// Register Form Submit
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("reg-name") as HTMLInputElement;
    const emailInput = document.getElementById("reg-email") as HTMLInputElement;
    const passwordInput = document.getElementById("reg-password") as HTMLInputElement;

    try {
      if (authErrorBanner) authErrorBanner.style.display = "none";
      await AuthService.register(emailInput.value, passwordInput.value, nameInput.value);
      alert("Registration submitted successfully! You may now sign in.");
      tabLoginBtn?.click();
    } catch (err: any) {
      if (authErrorBanner) {
        authErrorBanner.textContent = err.message || "Registration failed.";
        authErrorBanner.style.display = "block";
      }
    }
  });
}

// Logout Handler
if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    AuthService.logout();
    updateAuthStateUI();
    alert("Signed out successfully.");
  });
}

// Initial UI Setup
updateAuthStateUI();

if (launchBtn) {
  launchBtn.addEventListener("click", () => {
    if (!AuthService.isAuthenticated()) {
      alert("Please sign in or register to access cloud-synced trip itineraries.");
      openModal();
      return;
    }
    const user = AuthService.getUser();
    alert(`Launching Iter Viae Tactical Map Surface for ${user?.email}...\n\nMap Server: https://tiles.wade-usa.com\nValhalla Engine: https://valhalla.wade-usa.com\nDirectus Cloud API: https://api.wade-usa.com`);
  });
}

if (serverStatusBtn) {
  serverStatusBtn.addEventListener("click", () => {
    alert("Active API Infrastructure Nodes:\n\n1. Vector Tile Server: ONLINE (https://tiles.wade-usa.com)\n2. Valhalla Routing Engine: ONLINE (https://valhalla.wade-usa.com)\n3. Directus Cloud Backend: READY (https://api.wade-usa.com)");
  });
}
