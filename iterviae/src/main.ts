import "./styles.css";
import maplibregl from "maplibre-gl";
import { PocketBaseAuth } from "./pocketbase";

console.log("Iter Viae Tactical Surface initialized with Native Zoom-Based Vector POI Engine.");

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

// Global Map Instance
let map: maplibregl.Map | null = null;
const DEFAULT_CENTER: [number, number] = [-104.9903, 39.7392]; // Denver / Rocky Mountain Corridor

// Native Vector Style with Automatic Zoom-Based POIs (Gas, Food, Lodging, Transit, Parks)
const NATIVE_VECTOR_POI_STYLE = "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json";
const FALLBACK_DEMO_STYLE = "https://demotiles.maplibre.org/style.json";

function initializeMapSurface() {
  const container = document.getElementById("map-container");
  if (!container) return;

  if (map) {
    map.resize();
    return;
  }

  console.log("Initializing MapLibre GL Native Vector POI Map Surface...");

  map = new maplibregl.Map({
    container: "map-container",
    style: NATIVE_VECTOR_POI_STYLE,
    center: DEFAULT_CENTER,
    zoom: 12,
    minZoom: 3,
    maxZoom: 19,
    pitch: 0,
    bearing: 0,
    attributionControl: false
  });

  // Handle fallback if vector style URL is network-blocked
  let fallbackAttempted = false;
  map.on("error", (e) => {
    if (!fallbackAttempted && (e.error?.message?.includes("CORS") || e.error?.message?.includes("Failed to fetch") || e.error?.message?.includes("style"))) {
      fallbackAttempted = true;
      console.warn("Primary vector POI style fetch blocked. Switching to fallback vector style...", e);
      map?.setStyle(FALLBACK_DEMO_STYLE);
    }
  });

  // Add Navigation & Fullscreen Controls
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.addControl(new maplibregl.FullscreenControl(), "bottom-right");

  // Add default command center marker
  new maplibregl.Marker({ color: "#ef4444" })
    .setLngLat(DEFAULT_CENTER)
    .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML("<h4 style='color: #ef4444; margin-bottom: 4px;'>Iter Viae Command Center</h4><p style='color: #64748b; font-size: 0.8rem;'>Tactical Base Node 01</p>"))
    .addTo(map);

  // Enable click inspection on native vector POIs
  map.on("click", (e) => {
    if (!map) return;
    const features = map.queryRenderedFeatures(e.point);
    const poiFeature = features.find((f) => f.layer.id.includes("poi") || f.properties?.name);

    if (poiFeature && poiFeature.properties?.name) {
      const name = poiFeature.properties.name;
      const type = poiFeature.properties.class || poiFeature.properties.type || poiFeature.layer.id;

      new maplibregl.Popup({ offset: 15 })
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="font-family: Inter, sans-serif;">
            <h4 style="color:#ef4444; margin-bottom:4px; font-size:0.95rem;">📍 ${name}</h4>
            <p style="color:#64748b; font-size:0.78rem; text-transform:capitalize;">Category: ${type.replace(/_/g, " ")}</p>
          </div>
        `)
        .addTo(map);
    }
  });

  // Change cursor to pointer when hovering over clickable POIs
  map.on("mousemove", (e) => {
    if (!map) return;
    const features = map.queryRenderedFeatures(e.point);
    const hasPoi = features.some((f) => f.layer.id.includes("poi") || f.properties?.name);
    map.getCanvas().style.cursor = hasPoi ? "pointer" : "";
  });

  map.on("load", () => {
    map?.resize();
  });

  setTimeout(() => {
    map?.resize();
  }, 100);

  setTimeout(() => {
    map?.resize();
  }, 400);
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
      // Verified User View -> Render Full 100vh Viewport Map Surface
      if (guestView) guestView.style.display = "none";
      if (unverifiedView) unverifiedView.style.display = "none";
      if (verifiedView) verifiedView.style.display = "flex";
      if (appFooter) appFooter.style.display = "none";

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
