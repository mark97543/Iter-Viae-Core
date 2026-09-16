import "./styles.css";
import {
  pb,
  isUserAuthenticated,
  getCurrentUser,
  loginUser,
  registerUser,
  logoutUser,
  fetchUserTrips,
  createTripRecord,
  archiveTripRecord,
  unarchiveTripRecord,
  deleteTripRecord,
  shareTripByEmail,
  getSpokeAppUrl,
  TripRecord,
  TripTemplate,
} from "./pocketbase";

console.log("Wade USA Hub & Spoke Portal (wade-usa.com) Initialized.");

// State
let currentTab: "active" | "archived" = "active";
let currentFilter: "all" | "roadtrip" | "travel" | "shared" = "all";
let searchQuery: string = "";
let loadedTrips: TripRecord[] = [];
let activeShareTripId: string | null = null;

// DOM Elements
const tabActiveTrips = document.getElementById("tab-active-trips") as HTMLButtonElement;
const tabArchiveTrips = document.getElementById("tab-archive-trips") as HTMLButtonElement;
const activeCountBadge = document.getElementById("active-count") as HTMLElement;
const archiveCountBadge = document.getElementById("archive-count") as HTMLElement;

const btnCreateTripMain = document.getElementById("btn-create-trip-main") as HTMLButtonElement;
const authStatusContainer = document.getElementById("auth-status-container") as HTMLElement;

const searchInput = document.getElementById("trip-search-input") as HTMLInputElement;
const filterPills = document.querySelectorAll(".filter-pill");
const tripsGridContainer = document.getElementById("trips-grid-container") as HTMLElement;

// Auth Modal Elements
const authModal = document.getElementById("auth-modal") as HTMLElement;
const authCloseBtn = document.getElementById("auth-close-btn") as HTMLElement;
const authTabLogin = document.getElementById("auth-tab-login") as HTMLElement;
const authTabRegister = document.getElementById("auth-tab-register") as HTMLElement;
const authModalTitle = document.getElementById("auth-modal-title") as HTMLElement;
const authForm = document.getElementById("auth-form") as HTMLFormElement;
const nameFieldGroup = document.getElementById("name-field-group") as HTMLElement;
const authNameInput = document.getElementById("auth-name-input") as HTMLInputElement;
const authEmailInput = document.getElementById("auth-email-input") as HTMLInputElement;
const authPasswordInput = document.getElementById("auth-password-input") as HTMLInputElement;
const authSubmitBtn = document.getElementById("auth-submit-btn") as HTMLButtonElement;
const authErrorMsg = document.getElementById("auth-error-msg") as HTMLElement;
let isRegisterMode = false;

// Create Trip Modal Elements
const createTripModal = document.getElementById("create-trip-modal") as HTMLElement;
const createTripCloseBtn = document.getElementById("create-trip-close-btn") as HTMLElement;
const createTripCancelBtn = document.getElementById("create-trip-cancel-btn") as HTMLElement;
const createTripForm = document.getElementById("create-trip-form") as HTMLFormElement;
const newTripTitle = document.getElementById("new-trip-title") as HTMLInputElement;
const newTripStart = document.getElementById("new-trip-start") as HTMLInputElement;
const newTripEnd = document.getElementById("new-trip-end") as HTMLInputElement;
const newTripDestination = document.getElementById("new-trip-destination") as HTMLInputElement;
const newTripSummary = document.getElementById("new-trip-summary") as HTMLTextAreaElement;
const createTripError = document.getElementById("create-trip-error") as HTMLElement;
const createTripSubmitBtn = document.getElementById("create-trip-submit-btn") as HTMLButtonElement;

const typeCardRoad = document.getElementById("type-card-road") as HTMLElement;
const typeCardTravel = document.getElementById("type-card-travel") as HTMLElement;

// Share Modal Elements
const shareModal = document.getElementById("share-modal") as HTMLElement;
const shareModalTitle = document.getElementById("share-modal-title") as HTMLElement;
const shareCloseBtn = document.getElementById("share-close-btn") as HTMLElement;
const shareCancelBtn = document.getElementById("share-cancel-btn") as HTMLElement;
const shareEmailInput = document.getElementById("share-email-input") as HTMLInputElement;
const shareSubmitBtn = document.getElementById("share-submit-btn") as HTMLButtonElement;
const shareFeedbackMsg = document.getElementById("share-feedback-msg") as HTMLElement;

async function init() {
  setupEventListeners();
  renderAuthStatus();
  await loadAndRenderTrips();
}

function renderAuthStatus() {
  if (isUserAuthenticated()) {
    const user = getCurrentUser();
    const displayName = user?.name || user?.username || user?.email || "Traveler";
    authStatusContainer.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px;">
        <span style="font-size:0.88rem; font-weight:600; color:#e2e8f0;">👤 ${escapeHtml(displayName)}</span>
        <button id="btn-logout" class="btn btn-sm btn-secondary">Log Out</button>
      </div>
    `;
    document.getElementById("btn-logout")?.addEventListener("click", () => {
      logoutUser();
      renderAuthStatus();
      loadAndRenderTrips();
    });
  } else {
    authStatusContainer.innerHTML = `
      <button id="btn-open-login" class="btn btn-sm btn-secondary">🔑 Log In / Register</button>
    `;
    document.getElementById("btn-open-login")?.addEventListener("click", () => openAuthModal(false));
  }
}

async function loadAndRenderTrips() {
  // USER LOCK-DOWN: Must be authenticated to view trips!
  if (!isUserAuthenticated()) {
    tripsGridContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔐</div>
        <h3>User Authentication Required</h3>
        <p>Please log in or register a Wade USA account to access your personal trips and shared itineraries.</p>
        <button id="btn-lockdown-login" class="btn btn-primary">Log In / Sign Up</button>
      </div>
    `;
    document.getElementById("btn-lockdown-login")?.addEventListener("click", () => openAuthModal(false));
    activeCountBadge.innerText = "0";
    archiveCountBadge.innerText = "0";
    openAuthModal(false);
    return;
  }

  tripsGridContainer.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading trips from Wade USA database...</p>
    </div>
  `;

  try {
    const activeTrips = await fetchUserTrips("active");
    const archivedTrips = await fetchUserTrips("archived");

    activeCountBadge.innerText = String(activeTrips.length);
    archiveCountBadge.innerText = String(archivedTrips.length);

    loadedTrips = currentTab === "active" ? activeTrips : archivedTrips;
    renderTripsGrid();
  } catch (err) {
    tripsGridContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <h3>Failed to load trips</h3>
        <p>Could not connect to PocketBase backend (api.wade-usa.com).</p>
      </div>
    `;
  }
}

function renderTripsGrid() {
  const query = searchQuery.trim().toLowerCase();
  const user = getCurrentUser();

  const filtered = loadedTrips.filter((t) => {
    const matchesSearch =
      !query ||
      t.title.toLowerCase().includes(query) ||
      (t.destination && t.destination.toLowerCase().includes(query)) ||
      (t.dates && t.dates.toLowerCase().includes(query));

    if (!matchesSearch) return false;
    if (currentFilter === "roadtrip") return t.trip_template === "ROADTRIP";
    if (currentFilter === "travel") return t.trip_template === "TRAVEL";
    if (currentFilter === "shared") return t.user !== user?.id && (t.shared || []).includes(user?.id || "");
    return true;
  });

  if (filtered.length === 0) {
    tripsGridContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${currentTab === "active" ? "🧭" : "📦"}</div>
        <h3>No ${currentTab === "active" ? "Active" : "Archived"} Trips Found</h3>
        <p>${searchQuery ? "No trips match your search term." : currentTab === "active" ? "Create a new Road Trip or Travel Plan to get started!" : "Your archive is currently empty."}</p>
        ${currentTab === "active" ? `<button id="btn-empty-create" class="btn btn-primary">➕ Create New Trip</button>` : ""}
      </div>
    `;
    document.getElementById("btn-empty-create")?.addEventListener("click", () => openCreateTripModal());
    return;
  }

  tripsGridContainer.innerHTML = "";

  filtered.forEach((trip) => {
    const isOwner = !user || !trip.user || trip.user === "guest" || trip.user === user.id;
    const isRoadTrip = trip.trip_template === "ROADTRIP";
    const appTarget = isRoadTrip ? "road" : "travel";
    const targetUrl = getSpokeAppUrl(appTarget, trip.id);
    const domainLabel = isRoadTrip ? "road.wade-usa.com" : "travel.wade-usa.com";
    const coverGradient = trip.coverGradient || (isRoadTrip ? "linear-gradient(135deg, #0ea5e9, #3b82f6)" : "linear-gradient(135deg, #06b6d4, #8b5cf6)");

    const card = document.createElement("div");
    card.className = "trip-card";

    card.innerHTML = `
      <div class="trip-card-header" style="background: ${coverGradient};">
        <span class="trip-template-tag">${isRoadTrip ? "🚗 Road Trip" : "✈️ Travel Plan"}</span>
        <div class="trip-emoji-badge">${trip.coverEmoji || (isRoadTrip ? "🚗" : "✈️")}</div>
      </div>

      <div class="trip-card-body">
        <h3 class="trip-title">${escapeHtml(trip.title)}</h3>
        <div class="trip-meta">
          <div class="meta-item">📍 <span>${escapeHtml(trip.destination || "Destination TBD")}</span></div>
          <div class="meta-item">📅 <span>${escapeHtml(trip.dates || "Dates TBD")}</span></div>
          <div class="meta-item">🌐 <span style="font-family: var(--font-mono); color: var(--primary); font-size:0.8rem;">${domainLabel}</span></div>
          ${!isOwner ? `<div class="meta-item" style="color:var(--accent); font-weight:600;">👥 Shared with you</div>` : ""}
        </div>
        <p class="trip-summary">${escapeHtml(trip.summary || "No summary provided.")}</p>
      </div>

      <div class="trip-card-footer">
        <a href="${targetUrl}" class="btn btn-sm btn-primary">
          Launch App 🚀
        </a>

        <div class="card-actions-left">
          <button class="btn btn-sm btn-secondary share-btn" title="Share Trip by Email">👥 Share</button>
          ${currentTab === "active"
            ? `<button class="btn btn-sm btn-secondary archive-btn" title="Archive Trip">📦 Archive</button>`
            : `<button class="btn btn-sm btn-secondary unarchive-btn" title="Restore Trip">🔄 Restore</button>`
          }
          ${isOwner ? `<button class="btn btn-sm btn-outline-danger delete-btn" title="Delete Trip">🗑️</button>` : ""}
        </div>
      </div>
    `;

    card.querySelector(".share-btn")?.addEventListener("click", (e) => {
      e.preventDefault();
      openShareModal(trip);
    });

    card.querySelector(".archive-btn")?.addEventListener("click", async (e) => {
      e.preventDefault();
      await archiveTripRecord(trip.id);
      await loadAndRenderTrips();
    });

    card.querySelector(".unarchive-btn")?.addEventListener("click", async (e) => {
      e.preventDefault();
      await unarchiveTripRecord(trip.id);
      await loadAndRenderTrips();
    });

    card.querySelector(".delete-btn")?.addEventListener("click", async (e) => {
      e.preventDefault();
      if (confirm(`Are you sure you want to delete "${trip.title}" permanently?`)) {
        await deleteTripRecord(trip.id);
        await loadAndRenderTrips();
      }
    });

    tripsGridContainer.appendChild(card);
  });
}

function setupEventListeners() {
  tabActiveTrips.addEventListener("click", () => {
    currentTab = "active";
    tabActiveTrips.classList.add("active");
    tabArchiveTrips.classList.remove("active");
    loadAndRenderTrips();
  });

  tabArchiveTrips.addEventListener("click", () => {
    currentTab = "archived";
    tabArchiveTrips.classList.add("active");
    tabActiveTrips.classList.remove("active");
    loadAndRenderTrips();
  });

  filterPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      filterPills.forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      currentFilter = (pill as HTMLElement).dataset.filter as any;
      renderTripsGrid();
    });
  });

  searchInput.addEventListener("input", (e) => {
    searchQuery = (e.target as HTMLInputElement).value;
    renderTripsGrid();
  });

  btnCreateTripMain.addEventListener("click", () => openCreateTripModal());

  typeCardRoad.addEventListener("click", () => {
    typeCardRoad.classList.add("selected");
    typeCardTravel.classList.remove("selected");
    (typeCardRoad.querySelector("input") as HTMLInputElement).checked = true;
  });

  typeCardTravel.addEventListener("click", () => {
    typeCardTravel.classList.add("selected");
    typeCardRoad.classList.remove("selected");
    (typeCardTravel.querySelector("input") as HTMLInputElement).checked = true;
  });

  createTripCloseBtn.addEventListener("click", () => closeCreateTripModal());
  createTripCancelBtn.addEventListener("click", () => closeCreateTripModal());

  createTripForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    createTripError.innerText = "";

    const title = newTripTitle.value.trim();
    if (!title) {
      createTripError.innerText = "Trip title is required.";
      return;
    }

    const templateRadio = createTripForm.querySelector('input[name="trip_template"]:checked') as HTMLInputElement;
    const template: TripTemplate = (templateRadio?.value as TripTemplate) || "ROADTRIP";

    createTripSubmitBtn.disabled = true;
    createTripSubmitBtn.innerText = "Creating & Launching...";

    try {
      const createdRecord = await createTripRecord({
        title,
        trip_template: template,
        startDate: newTripStart.value,
        endDate: newTripEnd.value,
        destination: newTripDestination.value.trim(),
        summary: newTripSummary.value.trim(),
      });

      closeCreateTripModal();

      const targetApp = template === "ROADTRIP" ? "road" : "travel";
      window.location.href = getSpokeAppUrl(targetApp, createdRecord.id, createdRecord.slug);
    } catch (err: any) {
      createTripError.innerText = err.message || "Failed to create trip.";
      createTripSubmitBtn.disabled = false;
      createTripSubmitBtn.innerText = "Create & Launch App 🚀";
    }
  });

  // Auth Modal Handlers
  authCloseBtn.addEventListener("click", () => closeAuthModal());
  authTabLogin.addEventListener("click", () => setAuthMode(false));
  authTabRegister.addEventListener("click", () => setAuthMode(true));

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    authErrorMsg.innerText = "";
    authSubmitBtn.disabled = true;
    authSubmitBtn.innerText = "Processing...";

    const email = authEmailInput.value.trim();
    const pass = authPasswordInput.value.trim();
    const name = authNameInput.value.trim();

    try {
      if (isRegisterMode) {
        await registerUser(email, pass, name);
      } else {
        await loginUser(email, pass);
      }

      closeAuthModal();
      renderAuthStatus();
      await loadAndRenderTrips();
    } catch (err: any) {
      authErrorMsg.innerText = err.message || "Authentication failed.";
    } finally {
      authSubmitBtn.disabled = false;
      authSubmitBtn.innerText = isRegisterMode ? "Register Account" : "Log In";
    }
  });

  // Share Modal Handlers
  shareCloseBtn.addEventListener("click", () => closeShareModal());
  shareCancelBtn.addEventListener("click", () => closeShareModal());

  shareSubmitBtn.addEventListener("click", async () => {
    if (!activeShareTripId) return;
    const email = shareEmailInput.value.trim();
    if (!email) {
      shareFeedbackMsg.innerText = "Please enter an email address.";
      shareFeedbackMsg.className = "share-feedback error";
      return;
    }

    shareSubmitBtn.disabled = true;
    shareSubmitBtn.innerText = "Sharing...";

    const res = await shareTripByEmail(activeShareTripId, email);

    shareSubmitBtn.disabled = false;
    shareSubmitBtn.innerText = "Share Trip";

    shareFeedbackMsg.innerText = res.message;
    shareFeedbackMsg.className = res.success ? "share-feedback success" : "share-feedback error";

    if (res.success) {
      shareEmailInput.value = "";
    }
  });
}

function openCreateTripModal() {
  if (!isUserAuthenticated()) {
    openAuthModal(false);
    return;
  }
  createTripForm.reset();
  createTripError.innerText = "";
  createTripModal.classList.remove("hidden");
}

function closeCreateTripModal() {
  createTripModal.classList.add("hidden");
}

function openAuthModal(register: boolean) {
  setAuthMode(register);
  authForm.reset();
  authErrorMsg.innerText = "";
  authModal.classList.remove("hidden");
}

function closeAuthModal() {
  authModal.classList.add("hidden");
}

function setAuthMode(register: boolean) {
  isRegisterMode = register;
  if (register) {
    authTabRegister.classList.add("active");
    authTabLogin.classList.remove("active");
    nameFieldGroup.classList.remove("hidden");
    authModalTitle.innerText = "✨ Register Wade USA Account";
    authSubmitBtn.innerText = "Register Account";
  } else {
    authTabLogin.classList.add("active");
    authTabRegister.classList.remove("active");
    nameFieldGroup.classList.add("hidden");
    authModalTitle.innerText = "🔐 Sign In to Wade USA";
    authSubmitBtn.innerText = "Log In";
  }
}

function openShareModal(trip: TripRecord) {
  activeShareTripId = trip.id;
  shareModalTitle.innerText = `👥 Share "${trip.title}"`;
  shareEmailInput.value = "";
  shareFeedbackMsg.innerText = "";
  shareFeedbackMsg.className = "share-feedback";
  shareModal.classList.remove("hidden");
}

function closeShareModal() {
  shareModal.classList.add("hidden");
  activeShareTripId = null;
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (m) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m] || m;
  });
}

init();
