import "./styles.css";
import maplibregl from "maplibre-gl";
import { PocketBaseAuth } from "./pocketbase";

console.log("Iter Viae Tactical Surface initialized with POI Query Engine & MapLibre GL.");

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

const clearPoisBtn = document.getElementById("clear-pois-btn");

// Global Map Instance & Active Markers
let map: maplibregl.Map | null = null;
let activePoiMarkers: maplibregl.Marker[] = [];

const DEFAULT_CENTER: [number, number] = [-104.9903, 39.7392]; // Denver / Rocky Mountain Corridor

// High-Contrast Bright Voyager Map Style (Clear, vibrant roads and easy on eyes)
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

function clearPoiMarkers() {
  activePoiMarkers.forEach((m) => m.remove());
  activePoiMarkers = [];

  document.querySelectorAll(".poi-btn").forEach((btn) => btn.classList.remove("active"));
  if (clearPoisBtn) clearPoisBtn.style.display = "none";
}

// Fetch POIs dynamically from OpenStreetMap Overpass API
async function fetchPoisForCategory(category: string) {
  if (!map) return;

  clearPoiMarkers();

  const bounds = map.getBounds();
  const south = bounds.getSouth();
  const west = bounds.getWest();
  const north = bounds.getNorth();
  const east = bounds.getEast();

  let queryFilter = "";
  let iconEmoji = "📍";
  let markerColor = "#ef4444";

  switch (category) {
    case "fuel":
      queryFilter = 'node["amenity"="fuel"]';
      iconEmoji = "⛽";
      markerColor = "#f97316";
      break;
    case "food":
      queryFilter = 'node["amenity"~"restaurant|fast_food|cafe"]';
      iconEmoji = "🍔";
      markerColor = "#38bdf8";
      break;
    case "lodging":
      queryFilter = 'node["tourism"~"hotel|motel|guest_house"]';
      iconEmoji = "🏨";
      markerColor = "#a855f7";
      break;
    case "camping":
      queryFilter = 'node["tourism"~"camp_site|caravan_site"]';
      iconEmoji = "⛺";
      markerColor = "#10b981";
      break;
    case "repair":
      queryFilter = 'node["shop"~"car_repair|motorcycle"]';
      iconEmoji = "🔧";
      markerColor = "#eab308";
      break;
  }

  const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json][timeout:15];(${queryFilter}(${south},${west},${north},${east}););out body 50;`;

  try {
    const response = await fetch(overpassUrl);
    const data = await response.json();

    if (!data.elements || data.elements.length === 0) {
      alert(`No ${category} POIs found in the current map view area. Try panning or zooming out.`);
      return;
    }

    data.elements.forEach((element: any) => {
      if (!element.lat || !element.lon) return;

      const name = element.tags?.name || element.tags?.brand || `${category.toUpperCase()} Station`;
      const brand = element.tags?.brand ? `<p style='color:#94a3b8; font-size:0.75rem;'>Brand: ${element.tags.brand}</p>` : "";
      const street = element.tags?.["addr:street"] ? `<p style='color:#64748b; font-size:0.75rem;'>${element.tags["addr:street"]}</p>` : "";

      const popupHtml = `
        <div style="font-family: Inter, sans-serif;">
          <h4 style="color:#ef4444; margin-bottom:4px; font-size:0.95rem;">${iconEmoji} ${name}</h4>
          ${brand}
          ${street}
          <p style="color:#10b981; font-weight:600; font-size:0.75rem; margin-top:4px;">Lat: ${element.lat.toFixed(4)}, Lon: ${element.lon.toFixed(4)}</p>
        </div>
      `;

      const marker = new maplibregl.Marker({ color: markerColor })
        .setLngLat([element.lon, element.lat])
        .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(popupHtml))
        .addTo(map!);

      activePoiMarkers.push(marker);
    });

    if (clearPoisBtn) clearPoisBtn.style.display = "inline-flex";
  } catch (err) {
    console.error("Failed to fetch POIs:", err);
  }
}

function initializeMapSurface() {
  const container = document.getElementById("map-container");
  if (!container) return;

  if (map) {
    map.resize();
    return;
  }

  console.log("Initializing MapLibre GL Map Surface...");

  map = new maplibregl.Map({
    container: "map-container",
    style: BRIGHT_VOYAGER_MAP_STYLE,
    center: DEFAULT_CENTER,
    zoom: 11,
    minZoom: 3,
    maxZoom: 18,
    pitch: 0,
    bearing: 0,
    attributionControl: false
  });

  // Add Navigation & Fullscreen Controls
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
  map.addControl(new maplibregl.FullscreenControl(), "bottom-right");

  // Add default tactical location marker
  new maplibregl.Marker({ color: "#ef4444" })
    .setLngLat(DEFAULT_CENTER)
    .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML("<h4 style='color: #ef4444; margin-bottom: 4px;'>Iter Viae Command Center</h4><p style='color: #64748b; font-size: 0.8rem;'>Tactical Base Node 01</p>"))
    .addTo(map);

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

// POI Bar Event Listeners
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target && target.classList.contains("poi-btn") && target.dataset.category) {
    const category = target.dataset.category;
    document.querySelectorAll(".poi-btn").forEach((b) => b.classList.remove("active"));
    target.classList.add("active");
    fetchPoisForCategory(category);
  }
});

if (clearPoisBtn) {
  clearPoisBtn.addEventListener("click", clearPoiMarkers);
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
  clearPoiMarkers();
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
