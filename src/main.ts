import "./styles.css";
import { pb, isUserAuthenticated, getCurrentUser, isUserVerified, refreshVerificationStatus, isUsernameAvailable, loginUser, registerUser, logoutUser, fetchUserTrips, createNewTrip, deleteTrip, deleteTripRecord, leaveSharedTripRecord, fetchWelcomeBriefingFromDB, subscribeToWelcomeBriefing } from "./pocketbase";

console.log("ITER VIAE Platform Initialized (wade-usa.com)");

let isSignUpMode = false;
let activeSelectedTripId: string | null = null;

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
const btnCardAction = document.getElementById("btn-card-action");

// Unverified Modal Elements
const unverifiedModal = document.getElementById("unverified-modal");
const unverifiedModalClose = document.getElementById("unverified-modal-close");
const unverifiedUserEmail = document.getElementById("unverified-user-email");
const btnCheckVerification = document.getElementById("btn-check-verification");
const btnUnverifiedLogout = document.getElementById("btn-unverified-logout");

// Create Trip Elements
const btnOpenCreateTrip = document.getElementById("btn-open-create-trip");
const createTripModal = document.getElementById("create-trip-modal");
const createTripModalClose = document.getElementById("create-trip-modal-close");
const createTripForm = document.getElementById("create-trip-form") as HTMLFormElement | null;
const tripInputName = document.getElementById("trip-input-name") as HTMLInputElement | null;
const tripInputSummary = document.getElementById("trip-input-summary") as HTMLTextAreaElement | null;
const tripInputShared = document.getElementById("trip-input-shared") as HTMLInputElement | null;
const tripsGrid = document.getElementById("trips-grid");

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

// View Containers
const viewPrelogin = document.getElementById("view-prelogin");
const viewApp = document.getElementById("view-app");
const workspaceUserTag = document.getElementById("workspace-user-tag");

// Render Trips Workspace Grid
async function renderTripsWorkspace() {
  if (!tripsGrid) return;
  tripsGrid.innerHTML = `<div class="empty-trips-msg">Syncing your trips from PocketBase cloud...</div>`;

  const trips = await fetchUserTrips();
  const user = getCurrentUser();

  if (trips.length === 0) {
    tripsGrid.innerHTML = `
      <div class="empty-trips-msg" style="grid-column: 1 / -1; padding: 40px 20px;">
        <span style="font-size: 2rem; display: block; margin-bottom: 8px;">🗺️</span>
        <strong style="color: #ffffff; font-size: 1rem;">No Expedition Trips Found</strong>
        <p style="margin-top: 4px;">Click '➕ Create New Trip' above to build your first trip route.</p>
      </div>
    `;
    return;
  }

  tripsGrid.innerHTML = "";
  trips.forEach((t) => {
    const ownerId = typeof t.user === "object" ? (t.user as any)?.id : t.user;
    const isOwner = Boolean(user && ownerId === user.id);
    const isShared = t.shared && t.shared.length > 0;
    const isSelected = activeSelectedTripId === t.id;

    const card = document.createElement("div");
    card.className = "trip-card";
    if (isSelected) {
      card.style.borderColor = "var(--accent-cyan)";
      card.style.boxShadow = "0 0 30px rgba(56, 189, 248, 0.25)";
    }

    const titleText = t.trip || t.title || "UNTITLED TRIP";
    const summaryText = t.summary || "No description provided.";
    const formattedDate = t.updated ? new Date(t.updated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

    card.innerHTML = `
      <div class="trip-card-top">
        <div class="trip-card-badges">
          <span class="${isOwner ? "badge-owner" : "badge-shared"}">
            ${isOwner ? "👤 OWNER" : "🤝 SHARED WITH YOU"}
          </span>
          <span class="trip-card-date">${formattedDate}</span>
        </div>

        <h3 class="trip-card-title">${titleText}</h3>
        <p class="trip-card-summary">${summaryText}</p>
      </div>

      <div class="trip-card-actions">
        <button class="btn ${isSelected ? "btn-primary" : "btn-secondary"} btn-select-trip" style="flex:1;">
          ${isSelected ? "✓ SELECTED TRIP" : "🗺️ SELECT TRIP"}
        </button>
        ${isOwner ? 
          `<button class="btn btn-outline btn-delete-trip" title="Delete Trip" style="padding: 10px 12px; color: var(--accent-red); border-color: rgba(239,68,68,0.3);">🗑️</button>` : 
          `<button class="btn btn-outline btn-leave-trip" title="Leave Shared Trip" style="padding: 10px 12px; color: var(--accent-amber); border-color: rgba(245,158,11,0.3);">👋 Leave</button>`
        }
      </div>
    `;

    // Action button handlers
    const btnSelect = card.querySelector(".btn-select-trip") as HTMLButtonElement | null;
    if (btnSelect) {
      btnSelect.onclick = () => {
        activeSelectedTripId = t.id;
        showToast(`🗺️ Selected Trip: "${titleText}"`);
        renderTripsWorkspace();
      };
    }

    const btnDelete = card.querySelector(".btn-delete-trip") as HTMLButtonElement | null;
    if (btnDelete) {
      let confirmState = false;
      let resetTimer: any = null;

      btnDelete.onclick = async (e) => {
        e.stopPropagation();
        console.log("Delete trip button clicked:", t.id, titleText);

        if (!confirmState) {
          confirmState = true;
          btnDelete.textContent = "⚠️ CONFIRM DELETE?";
          btnDelete.style.background = "rgba(239, 68, 68, 0.25)";
          showToast(`👇 Click 'CONFIRM DELETE' to delete "${titleText}"`);
          resetTimer = setTimeout(() => {
            confirmState = false;
            btnDelete.textContent = "🗑️";
            btnDelete.style.background = "";
          }, 4000);
        } else {
          clearTimeout(resetTimer);
          try {
            showToast(`⏳ Deleting trip "${titleText}" from PocketBase cloud...`);
            await deleteTripRecord(t.id);
            showToast(`🗑️ Trip "${titleText}" deleted.`);
            if (activeSelectedTripId === t.id) activeSelectedTripId = null;
            renderTripsWorkspace();
          } catch (err: any) {
            console.error("Delete trip error:", err);
            showToast(`❌ ${err.message || "Failed to delete trip"}`);
            confirmState = false;
            btnDelete.textContent = "🗑️";
            btnDelete.style.background = "";
          }
        }
      };
    }

    const btnLeave = card.querySelector(".btn-leave-trip") as HTMLButtonElement | null;
    if (btnLeave) {
      let confirmState = false;
      let resetTimer: any = null;

      btnLeave.onclick = async (e) => {
        e.stopPropagation();
        console.log("Leave shared trip button clicked:", t.id, titleText);

        if (!confirmState) {
          confirmState = true;
          btnLeave.textContent = "⚠️ CONFIRM LEAVE?";
          btnLeave.style.background = "rgba(245, 158, 11, 0.25)";
          showToast(`👇 Click 'CONFIRM LEAVE' to remove self from "${titleText}"`);
          resetTimer = setTimeout(() => {
            confirmState = false;
            btnLeave.textContent = "👋 Leave";
            btnLeave.style.background = "";
          }, 4000);
        } else {
          clearTimeout(resetTimer);
          try {
            showToast(`⏳ Removing self from shared trip "${titleText}"...`);
            await leaveSharedTripRecord(t.id);
            showToast(`👋 Removed self from trip "${titleText}".`);
            if (activeSelectedTripId === t.id) activeSelectedTripId = null;
            renderTripsWorkspace();
          } catch (err: any) {
            console.error("Leave trip error:", err);
            showToast(`❌ ${err.message || "Failed to leave shared trip"}`);
            confirmState = false;
            btnLeave.textContent = "👋 Leave";
            btnLeave.style.background = "";
          }
        }
      };
    }

    tripsGrid.appendChild(card);
  });
}

// Update Auth UI Buttons, Views & Headers
function updateAuthUI() {
  const isAuth = isUserAuthenticated();
  const user = getCurrentUser();
  const verified = isUserVerified();

  if (isAuth && user && verified) {
    // Show Logged-In Screen (Separate from pre-login home screen)
    if (viewPrelogin) viewPrelogin.style.display = "none";
    if (viewApp) viewApp.style.display = "block";

    const displayName = user.email || user.username || "ACCOUNT";
    const shortName = displayName.split("@")[0].substring(0, 12).toUpperCase();

    if (workspaceUserTag) workspaceUserTag.textContent = `AUTHENTICATED SESSION • ${user.email || user.username}`;
    if (headerAuthLabel) headerAuthLabel.textContent = `ACCOUNT (${shortName})`;
    if (heroAuthLabel) heroAuthLabel.textContent = `MANAGE ACCOUNT (${shortName})`;
    if (btnCardAction) btnCardAction.innerHTML = `👤 OPEN EXPEDITION PROFILE (${shortName})`;

    renderTripsWorkspace();
  } else {
    // Show Pre-Login Home Screen
    if (viewPrelogin) viewPrelogin.style.display = "block";
    if (viewApp) viewApp.style.display = "none";

    if (isAuth && user && !verified) {
      const displayName = user.email || user.username || "ACCOUNT";
      const shortName = displayName.split("@")[0].substring(0, 12).toUpperCase();

      if (headerAuthLabel) headerAuthLabel.textContent = `⏳ UNVERIFIED (${shortName})`;
      if (heroAuthLabel) heroAuthLabel.textContent = `⏳ PENDING VERIFICATION (${shortName})`;
      if (btnCardAction) btnCardAction.innerHTML = `⏳ ACCOUNT VERIFICATION PENDING`;
    } else {
      if (headerAuthLabel) headerAuthLabel.textContent = "SIGN IN";
      if (heroAuthLabel) heroAuthLabel.textContent = "SIGN IN TO CLOUD";
      if (btnCardAction) btnCardAction.innerHTML = "🔑 SIGN IN / CREATE ACCOUNT";
    }
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

// Open Auth Modal, Unverified Screen, or Dashboard Modal
function handleAuthClick() {
  if (!isUserAuthenticated()) {
    if (authModal) authModal.style.display = "flex";
    return;
  }

  const user = getCurrentUser();
  if (!isUserVerified()) {
    if (unverifiedUserEmail && user) {
      unverifiedUserEmail.textContent = `Registered as ${user.email || user.username || "user"}`;
    }
    if (unverifiedModal) unverifiedModal.style.display = "flex";
  } else {
    if (dashUserEmail && user) dashUserEmail.textContent = user.email || user.username || "Rider";
    if (dashUserName && user) dashUserName.textContent = (user.username || user.email || "RIDER ACCOUNT").toUpperCase();
    if (dashboardModal) dashboardModal.style.display = "flex";
    renderDashboardTrips();
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

if (btnOpenCreateTrip) {
  btnOpenCreateTrip.addEventListener("click", () => {
    if (createTripModal) createTripModal.style.display = "flex";
  });
}

if (createTripModalClose) {
  createTripModalClose.addEventListener("click", () => {
    if (createTripModal) createTripModal.style.display = "none";
  });
}

if (createTripForm) {
  createTripForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!tripInputName) return;

    const nameVal = tripInputName.value.trim();
    const summaryVal = tripInputSummary ? tripInputSummary.value.trim() : "";
    const sharedRaw = tripInputShared ? tripInputShared.value.trim() : "";
    const sharedList = sharedRaw ? sharedRaw.split(",").map((s) => s.trim()).filter(Boolean) : [];

    if (!nameVal) return;

    try {
      showToast("Creating trip in PocketBase cloud...");
      await createNewTrip(nameVal, summaryVal, sharedList);
      showToast("✨ Expedition trip created!");
      createTripForm.reset();
      if (createTripModal) createTripModal.style.display = "none";
      renderTripsWorkspace();
    } catch (err: any) {
      console.error("Create trip failed:", err);
      showToast(`❌ Failed to create trip: ${err.message || "Check schema permissions"}`);
    }
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

if (unverifiedModalClose) {
  unverifiedModalClose.addEventListener("click", () => {
    if (unverifiedModal) unverifiedModal.style.display = "none";
  });
}

const authUsernameGroup = document.getElementById("auth-username-group");
const authUsername = document.getElementById("auth-username") as HTMLInputElement | null;
const authUsernameStatus = document.getElementById("auth-username-status");

if (authUsername) {
  let debounceTimer: any = null;
  authUsername.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    const val = authUsername.value.trim();
    if (!val) {
      if (authUsernameStatus) authUsernameStatus.style.display = "none";
      return;
    }

    debounceTimer = setTimeout(async () => {
      if (!isSignUpMode) return;
      const available = await isUsernameAvailable(val);
      if (authUsernameStatus) {
        authUsernameStatus.style.display = "block";
        if (available) {
          authUsernameStatus.textContent = `✓ Username "${val.toLowerCase()}" is available.`;
          authUsernameStatus.style.color = "var(--accent-emerald)";
        } else {
          authUsernameStatus.textContent = `❌ Username "${val.toLowerCase()}" is unavailable (not unique).`;
          authUsernameStatus.style.color = "var(--accent-red)";
        }
      }
    }, 350);
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
    if (authUsernameGroup) authUsernameGroup.style.display = isSignUpMode ? "flex" : "none";
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
    const usernameVal = authUsername ? authUsername.value.trim() : "";
    const vehicleVal = authVehicle ? authVehicle.value : "motorcycle";

    try {
      if (isSignUpMode) {
        await registerUser(emailVal, passVal, nameVal, usernameVal, vehicleVal);
        showToast("Account created successfully!");
      } else {
        await loginUser(emailVal, passVal);
        showToast("Welcome back to Iter Viae!");
      }

      updateAuthUI();
      if (authModal) authModal.style.display = "none";

      if (!isUserVerified()) {
        const user = getCurrentUser();
        if (unverifiedUserEmail && user) {
          unverifiedUserEmail.textContent = `Registered as ${user.email || user.username || "user"}`;
        }
        if (unverifiedModal) unverifiedModal.style.display = "flex";
        showToast("⏳ Account pending verification. Please contact wade.mark.a@gmail.com.");
      }
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

if (btnUnverifiedLogout) {
  btnUnverifiedLogout.addEventListener("click", () => {
    logoutUser();
    updateAuthUI();
    if (unverifiedModal) unverifiedModal.style.display = "none";
    showToast("Signed out of PocketBase.");
  });
}

if (btnCheckVerification) {
  btnCheckVerification.addEventListener("click", async () => {
    showToast("Checking verification status...");
    const verifiedNow = await refreshVerificationStatus();
    updateAuthUI();
    if (verifiedNow) {
      showToast("🎉 Account verified! Welcome to Iter Viae.");
      if (unverifiedModal) unverifiedModal.style.display = "none";
      handleAuthClick();
    } else {
      showToast("⏳ Verification pending. Please email wade.mark.a@gmail.com.");
    }
  });
}

// Populate Welcome Briefing Card UI
function applyWelcomeBriefingData(data: { badge?: string; title?: string; intro?: string; updated?: string }) {
  const cardBadge = document.getElementById("card-db-badge");
  const cardTitle = document.getElementById("card-db-title");
  const cardUpdated = document.getElementById("card-db-updated");
  const cardIntro = document.getElementById("card-db-intro");

  if (cardBadge && data.badge) cardBadge.textContent = data.badge;
  if (cardTitle && data.title) cardTitle.textContent = data.title;
  if (cardUpdated && data.updated) {
    const dateStr = new Date(data.updated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    cardUpdated.textContent = `Updated: ${dateStr}`;
  }
  if (cardIntro && data.intro) cardIntro.textContent = data.intro;
}

// Render Pre-Login Centered DB Welcome Card
async function renderCenteredDBCard() {
  const welcomeData = await fetchWelcomeBriefingFromDB();

  if (welcomeData) {
    applyWelcomeBriefingData(welcomeData);
  } else {
    applyWelcomeBriefingData({
      badge: "👋 WELCOME TO ITER VIAE",
      title: "WELCOME TO ITER VIAE",
      updated: new Date().toISOString(),
      intro: "Engineered for the open road. Plan overland expeditions and road trips on desktop, sync seamlessly to mobile handlebar cockpits, and track waypoints on the go."
    });
  }

  if (btnCardAction) {
    btnCardAction.onclick = () => {
      handleAuthClick();
    };
  }
}

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
  updateAuthUI();
  renderCenteredDBCard();

  // If user is authenticated on load but unverified, auto-show unverified modal
  if (isUserAuthenticated() && !isUserVerified()) {
    const user = getCurrentUser();
    if (unverifiedUserEmail && user) {
      unverifiedUserEmail.textContent = `Registered as ${user.email || user.username || "user"}`;
    }
    if (unverifiedModal) unverifiedModal.style.display = "flex";
  }

  // Real-time listener for live edits in PocketBase Admin UI
  subscribeToWelcomeBriefing((liveData) => {
    console.log("Real-time briefing update received:", liveData);
    applyWelcomeBriefingData(liveData);
    showToast("⚡ Briefing updated live from PocketBase Cloud!");
  });
});

