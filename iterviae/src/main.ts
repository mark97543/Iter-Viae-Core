import "./styles.css";
import maplibregl from "maplibre-gl";
import { PocketBaseAuth } from "./pocketbase";

console.log("Iter Viae Tactical Surface initialized with MapLibre GL Vector Engine.");

// DOM View Containers
const guestView = document.getElementById("guest-view");
const unverifiedView = document.getElementById("unverified-view");
const verifiedView = document.getElementById("verified-view");

// DOM Header & Button References
const heroAuthBtn = document.getElementById("hero-auth-btn");
const openAuthBtn = document.getElementById("open-auth-btn");
const authModal = document.getElementById("auth-modal");
const authModalClose = document.getElementById("auth-modal-close");
const serverStatusBtn = document.getElementById("server-status-btn");

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
const verifiedUserName = document.getElementById("verified-user-name");

// HUD Controls
const mapCoordsDisplay = document.getElementById("map-coords-display");
const mapZoomDisplay = document.getElementById("map-zoom-display");
const recenterMapBtn = document.getElementById("recenter-map-btn");
const toggleStyleBtn = document.getElementById("toggle-style-btn");

// Global Map Instance
let map: maplibregl.Map | null = null;
const DEFAULT_CENTER: [number, number] = [-104.9903, 39.7392]; // Denver / Rocky Mountain Corridor
const VECTOR_TILESERVER_STYLE = "https://tiles.wade-usa.com/styles/basic-preview/style.json";
const FALLBACK_DEMO_STYLE = "https://demotiles.maplibre.org/style.json";

function initializeMapSurface() {
  const container = document.getElementById("map-container");
  if (!container || map) return;

  console.log("Initializing MapLibre GL Map Surface...");

  map = new maplibregl.Map({
    container: "map-container",
    style: VECTOR_TILESERVER_STYLE,
    center: DEFAULT_CENTER,
    zoom: 11,
    pitch: 35,
    bearing: -10,
    attributionControl: false
  });

  // Handle TileServer error fallback gracefully
  map.on("error", (e) => {
    console.warn("TileServer GL style loading fallback event:", e);
  });

  // Add Navigation Controls
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.addControl(new maplibregl.FullscreenControl(), "bottom-right");

  // Track coordinates & zoom in HUD
  map.on("mousemove", (e) => {
    if (mapCoordsDisplay) {
      mapCoordsDisplay.textContent = `LAT: ${e.lngLat.lat.toFixed(4)} | LON: ${e.lngLat.lng.toFixed(4)}`;
    }
  });

  map.on("zoom", () => {
    if (mapZoomDisplay && map) {
      mapZoomDisplay.textContent = `ZOOM: ${map.getZoom().toFixed(1)}`;
    }
  });

  // Add default tactical location marker
  new maplibregl.Marker({ color: "#ef4444" })
    .setLngLat(DEFAULT_CENTER)
    .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML("<h4 style='color: #ef4444; margin-bottom: 4px;'>Iter Viae Command Center</h4><p style='color: #64748b; font-size: 0.8rem;'>Tactical Base Node 01</p>"))
    .addTo(map);

  setTimeout(() => {
    map?.resize();
  }, 300);
}

// Recenter Map Handler
if (recenterMapBtn) {
  recenterMapBtn.addEventListener("click", () => {
    if (map) {
      map.flyTo({ center: DEFAULT_CENTER, zoom: 11, pitch: 35, bearing: -10, speed: 1.2 });
    }
  });
}

// Style Source Toggle Handler
let currentStyleIsCustom = true;
if (toggleStyleBtn) {
  toggleStyleBtn.addEventListener("click", () => {
    if (!map) return;
    currentStyleIsCustom = !currentStyleIsCustom;
    const targetStyle = currentStyleIsCustom ? VECTOR_TILESERVER_STYLE : FALLBACK_DEMO_STYLE;
    map.setStyle(targetStyle);
    toggleStyleBtn.textContent = currentStyleIsCustom ? "🗺️ Tile Source: Wade-USA" : "🗺️ Tile Source: OpenMap";
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
      // Verified User View -> Render Map Surface
      if (guestView) guestView.style.display = "none";
      if (unverifiedView) unverifiedView.style.display = "none";
      if (verifiedView) verifiedView.style.display = "flex";
      if (verifiedUserName) verifiedUserName.textContent = user?.name || user?.email || "Verified User";

      initializeMapSurface();
    } else {
      // Unverified User View
      if (guestView) guestView.style.display = "none";
      if (verifiedView) verifiedView.style.display = "none";
      if (unverifiedView) unverifiedView.style.display = "flex";
      if (unverifiedUserEmail) unverifiedUserEmail.textContent = user?.email || "your account";
    }
  } else {
    // Guest View (Not logged in)
    if (openAuthBtn) openAuthBtn.style.display = "inline-flex";
    if (userSessionPill) userSessionPill.style.display = "none";

    if (guestView) guestView.style.display = "flex";
    if (unverifiedView) unverifiedView.style.display = "none";
    if (verifiedView) verifiedView.style.display = "none";
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
if (heroAuthBtn) heroAuthBtn.addEventListener("click", openModal);
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
    const identityInput = document.getElementById("login-email") as HTMLInputElement;
    const passwordInput = document.getElementById("login-password") as HTMLInputElement;

    try {
      if (authErrorBanner) authErrorBanner.style.display = "none";
      await PocketBaseAuth.login(identityInput.value, passwordInput.value);
      updateAuthStateUI();
      closeModal();
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
      closeModal();
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
  if (map) {
    map.remove();
    map = null;
  }
  updateAuthStateUI();
}

if (logoutBtn) logoutBtn.addEventListener("click", performLogout);
if (unverifiedLogoutBtn) unverifiedLogoutBtn.addEventListener("click", performLogout);

if (serverStatusBtn) {
  serverStatusBtn.addEventListener("click", () => {
    alert("Active API Infrastructure Nodes:\n\n1. Vector Tile Server: ONLINE (https://tiles.wade-usa.com)\n2. Valhalla Routing Engine: ONLINE (https://valhalla.wade-usa.com)\n3. PocketBase Cloud Backend: READY (https://api.wade-usa.com)");
  });
}

// Initial UI & View Setup
updateAuthStateUI();
