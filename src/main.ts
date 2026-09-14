import "./styles.css";
import { pb, isUserAuthenticated, getCurrentUser, loginUser, registerUser, logoutUser, fetchUserTrips, fetchLatestTripForCard } from "./pocketbase";

console.log("ITER VIAE Platform Initialized (wade-usa.com)");

let isSignUpMode = false;

// DOM Elements
const btnHeaderAuth = document.getElementById("btn-header-auth");
const headerAuthLabel = document.getElementById("header-auth-label");

const btnHeroAuth = document.getElementById("btn-hero-auth");
const heroAuthLabel = document.getElementById("hero-auth-label");
const btnLaunchCockpit = document.getElementById("btn-launch-cockpit");

// Modals
const authModal = document.getElementById("auth-modal");
const authModalClose = document.getElementById("auth-modal-close");
const loginForm = document.getElementById("login-form") as HTMLFormElement | null;
const authEmail = document.getElementById("auth-email") as HTMLInputElement | null;
const authPassword = document.getElementById("auth-password") as HTMLInputElement | null;
const authErrorMsg = document.getElementById("auth-error-msg");
const btnToggleAuthMode = document.getElementById("btn-toggle-auth-mode");
const btnSubmitAuth = document.getElementById("btn-submit-auth");
const authModalTitle = document.getElementById("auth-modal-title");
const authModalSubtitle = document.getElementById("auth-modal-subtitle");

const dashboardModal = document.getElementById("dashboard-modal");
const dashModalClose = document.getElementById("dash-modal-close");
const dashUserEmail = document.getElementById("dash-user-email");
const dashUserName = document.getElementById("dash-user-name");
const userTripsList = document.getElementById("user-trips-list");
const btnUserLogout = document.getElementById("btn-user-logout");

// Toast Helper
function showToast(msg: string) {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}

// Update Auth UI Buttons & Headers
function updateAuthUI() {
  const isAuth = isUserAuthenticated();
  const user = getCurrentUser();

  if (isAuth && user) {
    const displayName = user.email || user.username || "ACCOUNT";
    const shortName = displayName.split("@")[0].substring(0, 12).toUpperCase();

    if (headerAuthLabel) headerAuthLabel.textContent = `ACCOUNT (${shortName})`;
    if (heroAuthLabel) heroAuthLabel.textContent = `MANAGE ACCOUNT (${shortName})`;
  } else {
    if (headerAuthLabel) headerAuthLabel.textContent = "SIGN IN";
    if (heroAuthLabel) heroAuthLabel.textContent = "SIGN IN TO CLOUD";
  }
}

// Render User Trips in Dashboard Modal
async function renderDashboardTrips() {
  if (!userTripsList) return;
  userTripsList.innerHTML = `<div class="empty-trips-msg">Syncing expedition routes from cloud...</div>`;

  const trips = await fetchUserTrips();

  if (trips.length === 0) {
    userTripsList.innerHTML = `<div class="empty-trips-msg">No saved expedition routes found for your account.</div>`;
    return;
  }

  userTripsList.innerHTML = "";
  trips.forEach((trip) => {
    const card = document.createElement("div");
    card.style.cssText = `
      background: var(--bg-surface);
      border: 1.5px solid var(--border-color);
      border-radius: 12px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    `;

    const count = (trip.waypoints || []).length;
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:800; color:#ffffff; font-size:0.95rem;">${trip.title || "UNTITLED ROUTE"}</span>
        <span style="font-family:var(--font-mono); font-size:0.68rem; background:rgba(56,189,248,0.15); color:var(--accent-cyan); padding:2px 8px; border-radius:6px; font-weight:800;">${(trip.status || "PLANNED").toUpperCase()}</span>
      </div>
      <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-sub);">
        📍 ${count} Waypoints ${trip.metrics?.distance ? `• 📏 ${trip.metrics.distance}` : ""}
      </div>
    `;

    userTripsList.appendChild(card);
  });
}

// Open Auth Modal or Dashboard Modal
function handleAuthClick() {
  if (isUserAuthenticated()) {
    const user = getCurrentUser();
    if (dashUserEmail && user) dashUserEmail.textContent = user.email || user.username || "Rider";
    if (dashUserName && user) dashUserName.textContent = (user.username || user.email || "RIDER ACCOUNT").toUpperCase();
    if (dashboardModal) dashboardModal.style.display = "flex";
    renderDashboardTrips();
  } else {
    if (authModal) authModal.style.display = "flex";
  }
}

// Event Listeners
const authNameGroup = document.getElementById("auth-name-group");
const authName = document.getElementById("auth-name") as HTMLInputElement | null;
const authVehicleGroup = document.getElementById("auth-vehicle-group");
const authVehicle = document.getElementById("auth-vehicle") as HTMLSelectElement | null;

if (btnHeaderAuth) btnHeaderAuth.addEventListener("click", handleAuthClick);
if (btnHeroAuth) btnHeroAuth.addEventListener("click", handleAuthClick);

if (btnLaunchCockpit) {
  btnLaunchCockpit.addEventListener("click", () => {
    showToast("🚀 Redirecting to Mobile Cockpit (mobile.wade-usa.com)...");
    window.location.href = "/archive/v1-legacy/mobile/index.html";
  });
}

if (authModalClose) {
  authModalClose.addEventListener("click", () => {
    if (authModal) authModal.style.display = "none";
  });
}

if (dashModalClose) {
  dashModalClose.addEventListener("click", () => {
    if (dashboardModal) dashboardModal.style.display = "none";
  });
}

if (btnToggleAuthMode) {
  btnToggleAuthMode.addEventListener("click", () => {
    isSignUpMode = !isSignUpMode;
    if (authModalTitle) authModalTitle.textContent = isSignUpMode ? "CREATE ITER VIAE ACCOUNT" : "ITER VIAE ACCOUNT AUTH";
    if (authModalSubtitle) authModalSubtitle.textContent = isSignUpMode ? "Create an account to save and sync expedition routes" : "Sign in to access your saved expedition routes";
    if (btnSubmitAuth) btnSubmitAuth.textContent = isSignUpMode ? "✨ Create Account & Sign In" : "🚀 Sign In to Iter Viae";
    if (btnToggleAuthMode) btnToggleAuthMode.textContent = isSignUpMode ? "Already have an account? Sign in here" : "Need an account? Create one here";
    if (authNameGroup) authNameGroup.style.display = isSignUpMode ? "flex" : "none";
    if (authVehicleGroup) authVehicleGroup.style.display = isSignUpMode ? "flex" : "none";
    if (authErrorMsg) authErrorMsg.style.display = "none";
  });
}

if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!authEmail || !authPassword) return;

    if (authErrorMsg) authErrorMsg.style.display = "none";
    const emailVal = authEmail.value.trim();
    const passVal = authPassword.value;
    const nameVal = authName ? authName.value.trim() : "";
    const vehicleVal = authVehicle ? authVehicle.value : "motorcycle";

    try {
      if (isSignUpMode) {
        await registerUser(emailVal, passVal, nameVal, vehicleVal);
        showToast("Account created successfully!");
      } else {
        await loginUser(emailVal, passVal);
        showToast("Welcome back to Iter Viae!");
      }

      updateAuthUI();
      if (authModal) authModal.style.display = "none";
    } catch (err: any) {
      console.error("Auth failed:", err);
      let detailedMsg = err.message || "Authentication failed.";
      if (err.data && typeof err.data === "object") {
        const details: string[] = [];
        for (const k of Object.keys(err.data)) {
          if (err.data[k]?.message) {
            details.push(`${k}: ${err.data[k].message}`);
          }
        }
        if (details.length > 0) detailedMsg += ` — ${details.join(", ")}`;
      }
      if (authErrorMsg) {
        authErrorMsg.textContent = detailedMsg;
        authErrorMsg.style.display = "block";
      }
    }
  });
}

if (btnUserLogout) {
  btnUserLogout.addEventListener("click", () => {
    logoutUser();
    updateAuthUI();
    if (dashboardModal) dashboardModal.style.display = "none";
    showToast("Signed out of PocketBase.");
  });
}

// Render Centered DB Card
async function renderCenteredDBCard() {
  const cardTitle = document.getElementById("card-db-title");
  const cardUpdated = document.getElementById("card-db-updated");
  const cardIntro = document.getElementById("card-db-intro");
  const btnCardAction = document.getElementById("btn-card-action");

  const trip = await fetchLatestTripForCard();

  if (trip) {
    if (cardTitle) cardTitle.textContent = trip.title || "EXPEDITION ROUTE";
    if (cardUpdated && trip.updated) {
      const dateStr = new Date(trip.updated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      cardUpdated.textContent = `Updated: ${dateStr}`;
    }
    if (cardIntro) cardIntro.textContent = trip.summary || (trip.waypoints && trip.waypoints.length > 0 ? `Active expedition featuring ${trip.waypoints.length} checkpoints and route guidance.` : "Saved expedition route from cloud database.");
    if (btnCardAction) {
      btnCardAction.textContent = "🚀 LAUNCH EXPEDITION ROUTE";
      btnCardAction.onclick = () => {
        showToast(`Launching ${trip.title || "Expedition"}...`);
        window.location.href = `/archive/v1-legacy/mobile/index.html?tripId=${trip.id}`;
      };
    }
  } else {
    if (cardTitle) cardTitle.textContent = "THAILAND MOTO TOUR 2027";
    if (cardUpdated) cardUpdated.textContent = "Updated: Sep 14, 2026";
    if (cardIntro) cardIntro.textContent = "Full 18-day motorcycle expedition through northern Thailand's Mae Hong Son loop, featuring mountain passes, border checkpoints, and overnight stays.";
    if (btnCardAction) {
      btnCardAction.textContent = "🚀 EXPLORE FEATURED ROUTE";
      btnCardAction.onclick = () => {
        showToast("Opening featured route details...");
      };
    }
  }
}

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
  updateAuthUI();
  renderCenteredDBCard();
});
