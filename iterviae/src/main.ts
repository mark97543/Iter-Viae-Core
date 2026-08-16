import "./styles.css";
import maplibregl from "maplibre-gl";
import { pb, PocketBaseAuth } from "./pocketbase";

console.log("Iter Viae Tactical Surface initialized with Expedition Trip Planner Engine.");

// Waypoint Data Interface
interface Waypoint {
  id: string;
  title: string;
  lat: number | null;
  lon: number | null;
  type: "origin" | "stop" | "destination";
}

// DOM View Containers
const guestView = document.getElementById("guest-view");
const unverifiedView = document.getElementById("unverified-view");
const verifiedView = document.getElementById("verified-view");
const appFooter = document.getElementById("app-footer");

// DOM Header & Button References
const heroAuthBtn = document.getElementById("hero-auth-btn");
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
const userVerificationBadge = document.getElementById("user-verification-badge");
const logoutBtn = document.getElementById("logout-btn");

const unverifiedUserEmail = document.getElementById("unverified-user-email");
const unverifiedLogoutBtn = document.getElementById("unverified-logout-btn");

const coordSearchForm = document.getElementById("coord-search-form") as HTMLFormElement;
const coordSearchInput = document.getElementById("coord-search-input") as HTMLInputElement;

// DOM Trip Planner Panel References
const plannerPanel = document.getElementById("planner-panel");
const togglePlannerBtn = document.getElementById("toggle-planner-btn");
const expandPlannerBtn = document.getElementById("expand-planner-btn");
const tripTitleInput = document.getElementById("trip-title-input") as HTMLInputElement;
const waypointsContainer = document.getElementById("waypoints-container");
const addWaypointBtn = document.getElementById("add-waypoint-btn");
const saveTripBtn = document.getElementById("save-trip-btn");

// DOM Context Menu & Toast References
const contextMenu = document.getElementById("context-menu");
const contextCoordsText = document.getElementById("context-coords-text");
const contextCoordsItem = document.getElementById("context-coords-item");
const toastFeedback = document.getElementById("toast-feedback");

// Global State References
let map: maplibregl.Map | null = null;
let searchMarker: maplibregl.Marker | null = null;
let waypointMapMarkers: maplibregl.Marker[] = [];
let lastRightClickLngLat: { lat: number; lng: number } | null = null;
let toastTimeout: any = null;

// Initial Expedition Waypoints State
let waypoints: Waypoint[] = [
  { id: "wp-origin", title: "Expedition Origin", lat: 39.7392, lon: -104.9903, type: "origin" },
  { id: "wp-dest", title: "Destination Node", lat: 40.0150, lon: -105.2705, type: "destination" }
];

const DEFAULT_CENTER: [number, number] = [-104.9903, 39.7392]; // Denver / Rocky Mountain Corridor

// High-Contrast Bright Voyager Map Style
const BRIGHT_VOYAGER_MAP_STYLE = {
  version: 8 as const,
  sources: {
    "carto-voyager": {
      type: "raster" as const,
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors, © CARTO"
    }
  },
  layers: [
    {
      id: "carto-voyager-layer",
      type: "raster" as const,
      source: "carto-voyager",
      minzoom: 0,
      maxzoom: 19
    }
  ]
};

function clearSearchMarker() {
  if (searchMarker) {
    searchMarker.remove();
    searchMarker = null;
  }
}

function hideContextMenu() {
  if (contextMenu) contextMenu.style.display = "none";
}

function showToast(message: string) {
  if (!toastFeedback) return;
  toastFeedback.textContent = message;
  toastFeedback.style.display = "block";

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastFeedback.style.display = "none";
  }, 2500);
}

// Sync Map Markers with Active Waypoints List
function renderWaypointMapMarkers() {
  if (!map) return;

  // Clear existing waypoint markers
  waypointMapMarkers.forEach((m) => m.remove());
  waypointMapMarkers = [];

  waypoints.forEach((wp, idx) => {
    if (wp.lat === null || wp.lon === null) return;

    let markerColor = "#f59e0b"; // Orange for intermediate stops
    let iconLabel = `Stop #${idx}`;

    if (wp.type === "origin") {
      markerColor = "#10b981"; // Emerald green for origin
      iconLabel = "🏁 Expedition Origin";
    } else if (wp.type === "destination") {
      markerColor = "#ef4444"; // Crimson red for destination
      iconLabel = "🏆 Final Destination";
    }

    const popupHtml = `
      <div style="font-family: Inter, sans-serif; padding: 4px;">
        <h4 style="color:${markerColor}; margin-bottom:4px; font-size:0.92rem;">${iconLabel}</h4>
        <p style="font-weight:600; font-size:0.82rem; color:#f8fafc;">${wp.title}</p>
        <p style="color:#94a3b8; font-size:0.75rem; font-family: monospace; margin-top:2px;">${wp.lat.toFixed(6)}, ${wp.lon.toFixed(6)}</p>
      </div>
    `;

    const popup = new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(popupHtml);

    const marker = new maplibregl.Marker({ color: markerColor })
      .setLngLat([wp.lon, wp.lat])
      .setPopup(popup)
      .addTo(map!);

    waypointMapMarkers.push(marker);
  });
}

// Render Left Panel Waypoints List UI
function renderWaypointsUI() {
  if (!waypointsContainer) return;

  waypointsContainer.innerHTML = "";

  waypoints.forEach((wp) => {
    const itemEl = document.createElement("div");
    itemEl.className = "waypoint-item";

    let iconEmoji = "📍";
    if (wp.type === "origin") iconEmoji = "🏁";
    else if (wp.type === "destination") iconEmoji = "🏆";

    const coordsString = (wp.lat !== null && wp.lon !== null) 
      ? `${wp.lat.toFixed(6)}, ${wp.lon.toFixed(6)}` 
      : "";

    itemEl.innerHTML = `
      <span class="waypoint-badge-icon">${iconEmoji}</span>
      <div class="waypoint-inputs">
        <input 
          type="text" 
          class="waypoint-name-input" 
          data-id="${wp.id}" 
          data-field="title"
          value="${wp.title}" 
          placeholder="Waypoint Title" 
        />
        <input 
          type="text" 
          class="waypoint-coords-input" 
          data-id="${wp.id}" 
          data-field="coords"
          value="${coordsString}" 
          placeholder="Lat, Lon coordinates" 
        />
      </div>
      ${wp.type === "stop" ? `<button class="btn-remove-waypoint" data-id="${wp.id}" title="Remove Stop">✕</button>` : ""}
    `;

    waypointsContainer.appendChild(itemEl);
  });

  renderWaypointMapMarkers();
}

// Handlers for Waypoints UI Inputs & Add/Remove
if (waypointsContainer) {
  waypointsContainer.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    if (!target) return;

    const id = target.dataset.id;
    const field = target.dataset.field;
    if (!id || !field) return;

    const wp = waypoints.find((w) => w.id === id);
    if (!wp) return;

    if (field === "title") {
      wp.title = target.value;
    } else if (field === "coords") {
      const parts = target.value.split(/[\s,]+/).filter(Boolean);
      if (parts.length >= 2) {
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lon)) {
          wp.lat = lat;
          wp.lon = lon;
        }
      }
    }

    renderWaypointMapMarkers();
  });

  waypointsContainer.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (target && target.classList.contains("btn-remove-waypoint")) {
      const id = target.dataset.id;
      if (!id) return;
      waypoints = waypoints.filter((w) => w.id !== id);
      renderWaypointsUI();
    }
  });
}

// Add New Stop Button Event
if (addWaypointBtn) {
  addWaypointBtn.addEventListener("click", () => {
    const newStop: Waypoint = {
      id: `wp-stop-${Date.now()}`,
      title: `Waystop #${waypoints.length - 1}`,
      lat: 39.8000 + (Math.random() * 0.1),
      lon: -105.1000 - (Math.random() * 0.1),
      type: "stop"
    };

    // Insert stop before destination
    waypoints.splice(waypoints.length - 1, 0, newStop);
    renderWaypointsUI();
  });
}

// Left Drawer Collapse / Expand Controls
function collapsePlannerPanel() {
  if (plannerPanel) plannerPanel.classList.add("collapsed");
  if (expandPlannerBtn) expandPlannerBtn.style.display = "flex";
  setTimeout(() => map?.resize(), 320);
}

function expandPlannerPanel() {
  if (plannerPanel) plannerPanel.classList.remove("collapsed");
  if (expandPlannerBtn) expandPlannerBtn.style.display = "none";
  setTimeout(() => map?.resize(), 320);
}

if (togglePlannerBtn) togglePlannerBtn.addEventListener("click", collapsePlannerPanel);
if (expandPlannerBtn) expandPlannerBtn.addEventListener("click", expandPlannerPanel);

// Save Trip to Cloud Backend (PocketBase)
if (saveTripBtn) {
  saveTripBtn.addEventListener("click", async () => {
    if (!PocketBaseAuth.isAuthenticated()) {
      alert("Please sign in to save trips to your cloud logbook.");
      return;
    }

    const title = tripTitleInput ? tripTitleInput.value.trim() : "New Expedition Trip";
    const user = PocketBaseAuth.getUser() as any;

    try {
      saveTripBtn.textContent = "💾 Saving to Cloud...";
      await pb.collection("trips").create({
        user: user.id,
        title: title,
        status: "planned",
        waypoints: waypoints,
        metrics: {
          distance: "42.5 mi",
          duration: "1h 15m"
        }
      });

      saveTripBtn.textContent = "💾 Save Trip to Cloud";
      showToast("Expedition Trip saved to PocketBase Cloud!");
    } catch (err: any) {
      saveTripBtn.textContent = "💾 Save Trip to Cloud";
      console.error("Failed to save trip:", err);
      alert(err.message || "Failed to save trip. Check PocketBase collection permissions.");
    }
  });
}

function addPinAtLocation(lat: number, lon: number) {
  if (!map) return;

  clearSearchMarker();

  if (coordSearchInput) {
    coordSearchInput.value = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }

  const popupHtml = `
    <div style="font-family: Inter, sans-serif; padding: 4px;">
      <h4 style="color:#ef4444; margin-bottom:4px; font-size:0.95rem;">📍 Target Waypoint</h4>
      <p style="color:#10b981; font-weight:600; font-size:0.8rem; font-family: monospace;">Latitude: ${lat.toFixed(6)}</p>
      <p style="color:#10b981; font-weight:600; font-size:0.8rem; font-family: monospace;">Longitude: ${lon.toFixed(6)}</p>
    </div>
  `;

  const popup = new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(popupHtml);

  searchMarker = new maplibregl.Marker({ color: "#ef4444" })
    .setLngLat([lon, lat])
    .setPopup(popup)
    .addTo(map);

  searchMarker.togglePopup();
}

function initializeMapSurface() {
  const container = document.getElementById("map-container");
  if (!container) return;

  if (map) {
    map.resize();
    renderWaypointMapMarkers();
    return;
  }

  console.log("Initializing MapLibre GL Map Surface...");

  map = new maplibregl.Map({
    container: "map-container",
    style: BRIGHT_VOYAGER_MAP_STYLE,
    center: DEFAULT_CENTER,
    zoom: 10,
    minZoom: 3,
    maxZoom: 18,
    pitch: 0,
    bearing: 0,
    attributionControl: false
  });

  // Add Navigation & Fullscreen Controls
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.addControl(new maplibregl.FullscreenControl(), "bottom-right");

  // Dismiss marker, popup & context menu when user left clicks anywhere on the map canvas
  map.on("click", () => {
    clearSearchMarker();
    hideContextMenu();
  });

  // Dismiss context menu on map drag
  map.on("dragstart", () => {
    hideContextMenu();
  });

  // Right-Click Context Menu Handler
  map.on("contextmenu", (e) => {
    e.preventDefault();
    if (!contextMenu || !contextCoordsText) return;

    lastRightClickLngLat = { lat: e.lngLat.lat, lng: e.lngLat.lng };
    const formattedCoords = `${e.lngLat.lat.toFixed(6)}, ${e.lngLat.lng.toFixed(6)}`;

    contextCoordsText.textContent = formattedCoords;

    // Position context menu at right-click cursor position
    contextMenu.style.left = `${e.point.x}px`;
    contextMenu.style.top = `${e.point.y}px`;
    contextMenu.style.display = "flex";
  });

  map.on("load", () => {
    map?.resize();
    renderWaypointMapMarkers();
  });

  setTimeout(() => {
    map?.resize();
  }, 100);

  setTimeout(() => {
    map?.resize();
  }, 400);
}

// Context Menu Copy Event Listener
function copyCoordinatesToClipboard() {
  if (!lastRightClickLngLat) return;
  const coordString = `${lastRightClickLngLat.lat.toFixed(6)}, ${lastRightClickLngLat.lng.toFixed(6)}`;
  navigator.clipboard.writeText(coordString);
  showToast(`Copied ${coordString} to clipboard!`);
  hideContextMenu();
}

if (contextCoordsItem) contextCoordsItem.addEventListener("click", copyCoordinatesToClipboard);

// Select-all UX enhancement on search input focus/click
if (coordSearchInput) {
  coordSearchInput.addEventListener("focus", () => {
    coordSearchInput.select();
  });
  coordSearchInput.addEventListener("click", () => {
    coordSearchInput.select();
  });
}

// Coordinate Search Form Handler (Lat, Lon)
if (coordSearchForm && coordSearchInput) {
  coordSearchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    hideContextMenu();
    const query = coordSearchInput.value.trim();
    if (!query || !map) return;

    const parts = query.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 2) {
      alert("Invalid format! Please enter valid coordinates in format: Lat, Lon (e.g. 39.7392, -104.9903)");
      return;
    }

    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      alert("Latitude must be between -90 and 90, Longitude must be between -180 and 180.");
      return;
    }

    // Fly map to searched target location
    map.flyTo({
      center: [lon, lat],
      zoom: 14,
      speed: 1.4,
      essential: true
    });

    addPinAtLocation(lat, lon);
  });
}

// View Switcher & Auth UI State Management
function updateAuthStateUI() {
  if (PocketBaseAuth.isAuthenticated()) {
    const user = PocketBaseAuth.getUser() as any;
    const isVerified = Boolean(user?.verified);

    // Update Navbar Pill
    if (openAuthBtn) openAuthBtn.style.display = "none";
    if (userSessionPill) userSessionPill.style.display = "flex";
    if (userDisplayName) userDisplayName.textContent = user?.name || user?.email || "User";

    if (userVerificationBadge) {
      if (isVerified) {
        userVerificationBadge.textContent = "VERIFIED";
        userVerificationBadge.className = "badge badge-success";
      } else {
        userVerificationBadge.textContent = "UNVERIFIED";
        userVerificationBadge.className = "badge badge-warning";
      }
    }

    // Router: Switch between Unverified Screen vs Verified Map Surface Workspace
    if (isVerified) {
      // Verified User View -> Render Full 100vh Viewport Map Surface + Left Planner
      if (guestView) guestView.style.display = "none";
      if (unverifiedView) unverifiedView.style.display = "none";
      if (verifiedView) verifiedView.style.display = "flex";
      if (appFooter) appFooter.style.display = "none";

      renderWaypointsUI();

      setTimeout(() => {
        initializeMapSurface();
      }, 50);
    } else {
      // Unverified User View
      if (guestView) guestView.style.display = "none";
      if (verifiedView) verifiedView.style.display = "none";
      if (unverifiedView) unverifiedView.style.display = "flex";
      if (appFooter) appFooter.style.display = "block";
      if (unverifiedUserEmail) unverifiedUserEmail.textContent = user?.email || "your account";
    }
  } else {
    // Guest View (Not logged in)
    if (openAuthBtn) openAuthBtn.style.display = "inline-flex";
    if (userSessionPill) userSessionPill.style.display = "none";

    if (guestView) guestView.style.display = "flex";
    if (unverifiedView) unverifiedView.style.display = "none";
    if (verifiedView) verifiedView.style.display = "none";
    if (appFooter) appFooter.style.display = "block";
  }
}

// Auth Modal Handlers
function openAuthModal() {
  if (authModal) authModal.style.display = "flex";
  if (authErrorBanner) authErrorBanner.style.display = "none";
}

function closeAuthModal() {
  if (authModal) authModal.style.display = "none";
}

if (openAuthBtn) openAuthBtn.addEventListener("click", openAuthModal);
if (heroAuthBtn) heroAuthBtn.addEventListener("click", openAuthModal);
if (authModalClose) authModalClose.addEventListener("click", closeAuthModal);

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
    const identityInput = document.getElementById("login-email") as HTMLInputElement;
    const passwordInput = document.getElementById("login-password") as HTMLInputElement;

    try {
      if (authErrorBanner) authErrorBanner.style.display = "none";
      await PocketBaseAuth.login(identityInput.value, passwordInput.value);
      updateAuthStateUI();
      closeAuthModal();
    } catch (err: any) {
      if (authErrorBanner) {
        authErrorBanner.textContent = err.message || "Invalid email or password.";
        authErrorBanner.style.display = "block";
      }
    }
  });
}

// Register Form Submit (Defaults to Unverified user)
if (registerForm) {
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("reg-name") as HTMLInputElement;
    const emailInput = document.getElementById("reg-email") as HTMLInputElement;
    const passwordInput = document.getElementById("reg-password") as HTMLInputElement;

    try {
      if (authErrorBanner) authErrorBanner.style.display = "none";
      await PocketBaseAuth.register(emailInput.value, passwordInput.value, nameInput.value);
      await PocketBaseAuth.login(emailInput.value, passwordInput.value);
      updateAuthStateUI();
      closeAuthModal();
    } catch (err: any) {
      if (authErrorBanner) {
        authErrorBanner.textContent = err.message || "Registration failed.";
        authErrorBanner.style.display = "block";
      }
    }
  });
}

// Logout Handlers
function performLogout() {
  PocketBaseAuth.logout();
  clearSearchMarker();
  hideContextMenu();
  if (map) {
    map.remove();
    map = null;
  }
  updateAuthStateUI();
}

if (logoutBtn) logoutBtn.addEventListener("click", performLogout);
if (unverifiedLogoutBtn) unverifiedLogoutBtn.addEventListener("click", performLogout);

// Initial UI & View Setup
updateAuthStateUI();
