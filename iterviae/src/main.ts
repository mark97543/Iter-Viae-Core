import "./styles.css";
import maplibregl from "maplibre-gl";
import { pb, PocketBaseAuth } from "./pocketbase";
import { fetchExpeditionRoute, haversineDistance, LegMetric } from "./valhalla";

console.log("Iter Viae Tactical Surface initialized for Production Route Command with User Geolocation.");

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
const tripTitleClickable = document.getElementById("trip-title-clickable");
const tripTitleText = document.getElementById("trip-title-text");
const waypointsContainer = document.getElementById("waypoints-container");
const saveTripBtn = document.getElementById("save-trip-btn");

const metricDistance = document.getElementById("metric-distance");
const metricDuration = document.getElementById("metric-duration");

// DOM Trip Modal References
const tripModal = document.getElementById("trip-modal");
const tripModalClose = document.getElementById("trip-modal-close");
const tripSettingsForm = document.getElementById("trip-settings-form") as HTMLFormElement;
const modalTripTitle = document.getElementById("modal-trip-title") as HTMLInputElement;
const modalTripSummary = document.getElementById("modal-trip-summary") as HTMLTextAreaElement;

// DOM Context Menu & Toast References
const contextMenu = document.getElementById("context-menu");
const contextCoordsText = document.getElementById("context-coords-text");
const contextCoordsItem = document.getElementById("context-coords-item");
const contextAddStopBtn = document.getElementById("context-add-stop-btn");
const toastFeedback = document.getElementById("toast-feedback");

// Global State References
let map: maplibregl.Map | null = null;
let searchMarker: maplibregl.Marker | null = null;
let waypointMapMarkers: maplibregl.Marker[] = [];
let lastRightClickLngLat: { lat: number; lng: number } | null = null;
let toastTimeout: any = null;
let draggedWaypointIndex: number | null = null;
let currentLegMetrics: LegMetric[] = [];

// Clean Production Expedition State (No Dummy Locations)
let currentTripTitle = "MY EXPEDITION ROUTE";
let currentTripSummary = "Route log for long-range motorcycle trek.";

let waypoints: Waypoint[] = [
  { id: "wp-origin", title: "Current Position", lat: null, lon: null, type: "origin" },
  { id: "wp-dest", title: "Final Destination", lat: null, lon: null, type: "destination" }
];

const DEFAULT_CENTER: [number, number] = [-104.9903, 39.7392]; // Fallback center

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

// Format duration helper
function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h > 0) return `${h}H ${m}M`;
  return `${m}M`;
}

// Spatial algorithm to find optimal insertion index for right-click stop
function findOptimalInsertionIndex(lat: number, lon: number): number {
  const validWaypoints = waypoints.filter((w) => w.lat !== null && w.lon !== null);
  if (validWaypoints.length < 2) return waypoints.length - 1;

  let bestIndex = 1;
  let minDetour = Infinity;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const w1 = waypoints[i];
    const w2 = waypoints[i + 1];
    if (w1.lat === null || w1.lon === null || w2.lat === null || w2.lon === null) continue;

    const d1 = haversineDistance(w1.lat, w1.lon, lat, lon);
    const d2 = haversineDistance(lat, lon, w2.lat, w2.lon);
    const originalDist = haversineDistance(w1.lat, w1.lon, w2.lat, w2.lon);

    const detour = (d1 + d2) - originalDist;
    if (detour < minDetour) {
      minDetour = detour;
      bestIndex = i + 1;
    }
  }

  return bestIndex;
}

// Fetch turn-by-turn route line geometry & update metrics
async function updateExpeditionRoute() {
  if (!map) return;

  const validLocations = waypoints
    .filter((w) => w.lat !== null && w.lon !== null)
    .map((w) => ({ lat: w.lat!, lon: w.lon! }));

  if (validLocations.length < 2) {
    if (map.getSource("expedition-route-src")) {
      (map.getSource("expedition-route-src") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: []
      });
    }
    if (metricDistance) metricDistance.textContent = "0.0 MI";
    if (metricDuration) metricDuration.textContent = "0H 0M";
    currentLegMetrics = [];
    updateLegBadgesUI();
    return;
  }

  try {
    const { coordinates, distanceMi, durationSec, legs } = await fetchExpeditionRoute(validLocations);
    currentLegMetrics = legs;

    // Update main bottom metrics
    if (metricDistance) metricDistance.textContent = `${distanceMi.toFixed(1)} MI`;
    if (metricDuration) metricDuration.textContent = formatDuration(durationSec);

    // Update Leg Badges UI in left panel list
    updateLegBadgesUI();

    // Create GeoJSON Feature
    const routeGeoJSON: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: coordinates
          }
        }
      ]
    };

    if (map.getSource("expedition-route-src")) {
      (map.getSource("expedition-route-src") as maplibregl.GeoJSONSource).setData(routeGeoJSON);
    } else {
      map.addSource("expedition-route-src", {
        type: "geojson",
        data: routeGeoJSON
      });

      map.addLayer({
        id: "expedition-route-layer",
        type: "line",
        source: "expedition-route-src",
        layout: {
          "line-join": "round",
          "line-cap": "round"
        },
        paint: {
          "line-color": "#ef4444",
          "line-width": 5,
          "line-opacity": 0.85
        }
      });
    }
  } catch (err) {
    console.error("Expedition Route calculation error:", err);
  }
}

// Update inter-waypoint leg distance & time badges UI
function updateLegBadgesUI() {
  currentLegMetrics.forEach((leg, idx) => {
    const badgeEl = document.getElementById(`leg-badge-${idx}`);
    if (badgeEl) {
      badgeEl.textContent = `↓ ${leg.distanceMi.toFixed(1)} MI • ${formatDuration(leg.durationSec)}`;
    }
  });
}

// Sync Map Markers with Active Waypoints List (DRAGGABLE = TRUE)
function renderWaypointMapMarkers() {
  if (!map) return;

  // Clear existing waypoint markers
  waypointMapMarkers.forEach((m) => m.remove());
  waypointMapMarkers = [];

  waypoints.forEach((wp, idx) => {
    if (wp.lat === null || wp.lon === null) return;

    let markerColor = "#f59e0b";
    let iconLabel = `STOP #${idx}`;

    if (wp.type === "origin") {
      markerColor = "#10b981";
      iconLabel = "EXPEDITION ORIGIN";
    } else if (wp.type === "destination") {
      markerColor = "#ef4444";
      iconLabel = "FINAL DESTINATION";
    }

    const popupHtml = `
      <div style="font-family: Inter, sans-serif; padding: 4px;">
        <h4 style="color:${markerColor}; margin-bottom:4px; font-size:0.85rem; font-weight:800; font-family: 'JetBrains Mono', monospace;">[ ${iconLabel} ]</h4>
        <p style="font-weight:700; font-size:0.85rem; color:#f8fafc;">${wp.title}</p>
        <p style="color:#94a3b8; font-size:0.75rem; font-family: monospace; margin-top:2px;">${wp.lat.toFixed(6)}, ${wp.lon.toFixed(6)}</p>
      </div>
    `;

    const popup = new maplibregl.Popup({ offset: 25, closeButton: false }).setHTML(popupHtml);

    // Make Marker Draggable on Map Surface
    const marker = new maplibregl.Marker({ color: markerColor, draggable: true })
      .setLngLat([wp.lon, wp.lat])
      .setPopup(popup)
      .addTo(map!);

    // Handle Drag Events to recalculate route in real time
    marker.on("dragend", () => {
      const lngLat = marker.getLngLat();
      wp.lat = lngLat.lat;
      wp.lon = lngLat.lng;

      // Update popup content with new drag position
      const updatedPopupHtml = `
        <div style="font-family: Inter, sans-serif; padding: 4px;">
          <h4 style="color:${markerColor}; margin-bottom:4px; font-size:0.85rem; font-weight:800; font-family: 'JetBrains Mono', monospace;">[ ${iconLabel} ]</h4>
          <p style="font-weight:700; font-size:0.85rem; color:#f8fafc;">${wp.title}</p>
          <p style="color:#94a3b8; font-size:0.75rem; font-family: monospace; margin-top:2px;">${wp.lat.toFixed(6)}, ${wp.lon.toFixed(6)}</p>
        </div>
      `;
      marker.getPopup()?.setHTML(updatedPopupHtml);

      // Update Left Panel input fields
      const coordsInput = document.querySelector(`.waypoint-coords-input[data-id="${wp.id}"]`) as HTMLInputElement;
      if (coordsInput) {
        coordsInput.value = `${wp.lat.toFixed(6)}, ${wp.lon.toFixed(6)}`;
      }

      // Re-trigger live route recalculation!
      updateExpeditionRoute();
    });

    waypointMapMarkers.push(marker);
  });

  updateExpeditionRoute();
}

// Render Left Panel Waypoints List UI with Inter-Leg Inline Add Buttons & End Add Button
function renderWaypointsUI() {
  if (!waypointsContainer) return;

  waypointsContainer.innerHTML = "";

  // Ensure waypoint types are assigned correctly by array order
  waypoints.forEach((w, i) => {
    if (i === 0) w.type = "origin";
    else if (i === waypoints.length - 1) w.type = "destination";
    else w.type = "stop";
  });

  waypoints.forEach((wp, idx) => {
    // 1. Render Inter-Waypoint Leg Connector with Inline Add Button
    if (idx > 0) {
      const legIndex = idx - 1;
      const legMetric = currentLegMetrics[legIndex];
      const legText = legMetric 
        ? `↓ ${legMetric.distanceMi.toFixed(1)} MI • ${formatDuration(legMetric.durationSec)}`
        : `↓ ENTER LOCATION...`;

      const legEl = document.createElement("div");
      legEl.className = "leg-connector";
      legEl.innerHTML = `
        <span class="leg-line"></span>
        <span id="leg-badge-${legIndex}" class="leg-badge">${legText}</span>
        <button class="btn-add-inline-leg" data-insert-index="${idx}" title="Insert Stop Here">+</button>
      `;
      waypointsContainer.appendChild(legEl);
    }

    // 2. Render Waypoint Item Card
    const itemEl = document.createElement("div");
    itemEl.className = "waypoint-item";
    itemEl.setAttribute("draggable", "true");
    itemEl.setAttribute("data-index", idx.toString());

    let tagLabel = "STOP";
    let tagClass = "tag-stop";

    if (wp.type === "origin") {
      tagLabel = "ORIGIN";
      tagClass = "tag-origin";
    } else if (wp.type === "destination") {
      tagLabel = "DEST";
      tagClass = "tag-dest";
    } else {
      tagLabel = `#${idx}`;
    }

    const coordsString = (wp.lat !== null && wp.lon !== null) 
      ? `${wp.lat.toFixed(6)}, ${wp.lon.toFixed(6)}` 
      : "";

    itemEl.innerHTML = `
      <span class="drag-handle" title="Drag to reorder waypoint sequence">☰</span>
      <span class="waypoint-tag-badge ${tagClass}">[ ${tagLabel} ]</span>
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
          placeholder="Enter Lat, Lon coordinates" 
        />
      </div>
      ${waypoints.length > 2 ? `<button class="btn-remove-waypoint" data-id="${wp.id}" title="Remove Stop">✕</button>` : ""}
    `;

    // HTML5 Drag and Drop Event Listeners for Reordering List Items
    itemEl.addEventListener("dragstart", (e) => {
      draggedWaypointIndex = idx;
      itemEl.classList.add("dragging");
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", idx.toString());
      }
    });

    itemEl.addEventListener("dragend", () => {
      draggedWaypointIndex = null;
      itemEl.classList.remove("dragging");
      document.querySelectorAll(".waypoint-item").forEach((el) => el.classList.remove("drag-over"));
    });

    itemEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      itemEl.classList.add("drag-over");
    });

    itemEl.addEventListener("dragleave", () => {
      itemEl.classList.remove("drag-over");
    });

    itemEl.addEventListener("drop", (e) => {
      e.preventDefault();
      itemEl.classList.remove("drag-over");
      const targetIndex = idx;

      if (draggedWaypointIndex !== null && draggedWaypointIndex !== targetIndex) {
        // Reorder waypoints array
        const [movedWp] = waypoints.splice(draggedWaypointIndex, 1);
        waypoints.splice(targetIndex, 0, movedWp);

        // Re-render UI and redraw route
        renderWaypointsUI();
      }
    });

    waypointsContainer.appendChild(itemEl);
  });

  // 3. Render Add Stop at End Button Container
  const addEndContainer = document.createElement("div");
  addEndContainer.className = "add-end-stop-container";
  addEndContainer.innerHTML = `
    <button id="add-end-stop-btn" class="btn-add-end-stop">+ ADD STOP</button>
  `;
  waypointsContainer.appendChild(addEndContainer);

  renderWaypointMapMarkers();
}

// Helper to insert a new stop at a specific index
function insertNewStopAt(insertIndex: number, lat?: number, lon?: number) {
  let targetLat: number | null = lat !== undefined ? lat : null;
  let targetLon: number | null = lon !== undefined ? lon : null;

  const newStop: Waypoint = {
    id: `wp-stop-${Date.now()}`,
    title: `Waystop #${insertIndex}`,
    lat: targetLat,
    lon: targetLon,
    type: "stop"
  };

  waypoints.splice(insertIndex, 0, newStop);
  renderWaypointsUI();
}

// Handlers for Waypoints UI Inputs, Remove, Auto-Select text, and Inline/End Add Buttons
if (waypointsContainer) {
  // Auto-Select All Text on Focus in Waypoint Title / Coordinates Input
  waypointsContainer.addEventListener("focusin", (e) => {
    const target = e.target as HTMLInputElement;
    if (target && (target.classList.contains("waypoint-name-input") || target.classList.contains("waypoint-coords-input"))) {
      target.select();
    }
  });

  // Auto-Select All Text on Click in Waypoint Title / Coordinates Input
  waypointsContainer.addEventListener("click", (e) => {
    const target = e.target as HTMLInputElement;
    if (target && (target.classList.contains("waypoint-name-input") || target.classList.contains("waypoint-coords-input"))) {
      target.select();
      return;
    }

    // Inline Add Button
    if (target.classList.contains("btn-add-inline-leg")) {
      const insertIndex = parseInt(target.dataset.insertIndex || "1", 10);
      insertNewStopAt(insertIndex);
      return;
    }

    // End Add Button
    if (target.id === "add-end-stop-btn" || target.classList.contains("btn-add-end-stop")) {
      insertNewStopAt(waypoints.length - 1);
      return;
    }

    // Remove Stop Button
    if (target.classList.contains("btn-remove-waypoint")) {
      const id = target.dataset.id;
      if (!id) return;
      waypoints = waypoints.filter((w) => w.id !== id);
      renderWaypointsUI();
      return;
    }
  });

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
        } else {
          wp.lat = null;
          wp.lon = null;
        }
      } else {
        wp.lat = null;
        wp.lon = null;
      }
    }

    renderWaypointMapMarkers();
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

// Trip Title Clickable -> Opens Trip Settings Modal
function openTripModal() {
  if (!tripModal) return;
  if (modalTripTitle) modalTripTitle.value = currentTripTitle;
  if (modalTripSummary) modalTripSummary.value = currentTripSummary;
  tripModal.style.display = "flex";
}

function closeTripModal() {
  if (tripModal) tripModal.style.display = "none";
}

if (tripTitleClickable) tripTitleClickable.addEventListener("click", openTripModal);
if (tripModalClose) tripModalClose.addEventListener("click", closeTripModal);

if (tripSettingsForm) {
  tripSettingsForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (modalTripTitle && modalTripTitle.value.trim()) {
      currentTripTitle = modalTripTitle.value.trim().toUpperCase();
      if (tripTitleText) tripTitleText.textContent = currentTripTitle;
    }
    if (modalTripSummary) {
      currentTripSummary = modalTripSummary.value.trim();
    }
    closeTripModal();
    showToast("Expedition Details Updated!");
  });
}

// Save Trip to Cloud Backend (PocketBase)
if (saveTripBtn) {
  saveTripBtn.addEventListener("click", async () => {
    if (!PocketBaseAuth.isAuthenticated()) {
      alert("Please sign in to save trips to your cloud logbook.");
      return;
    }

    const user = PocketBaseAuth.getUser() as any;

    try {
      saveTripBtn.textContent = "Saving to Cloud...";
      await pb.collection("trips").create({
        user: user.id,
        title: currentTripTitle,
        status: "planned",
        waypoints: waypoints,
        summary: currentTripSummary,
        metrics: {
          distance: metricDistance?.textContent || "0.0 MI",
          duration: metricDuration?.textContent || "0H 0M"
        }
      });

      saveTripBtn.textContent = "Save Trip to Cloud";
      showToast("Expedition Trip saved to PocketBase Cloud!");
    } catch (err: any) {
      saveTripBtn.textContent = "Save Trip to Cloud";
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
      <h4 style="color:#ef4444; margin-bottom:4px; font-size:0.85rem; font-weight:800; font-family: 'JetBrains Mono', monospace;">[ TARGET WAYPOINT ]</h4>
      <p style="color:#10b981; font-weight:700; font-size:0.8rem; font-family: monospace;">Lat: ${lat.toFixed(6)}</p>
      <p style="color:#10b981; font-weight:700; font-size:0.8rem; font-family: monospace;">Lon: ${lon.toFixed(6)}</p>
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

  console.log("Initializing MapLibre GL Map Surface with Geolocation...");

  map = new maplibregl.Map({
    container: "map-container",
    style: BRIGHT_VOYAGER_MAP_STYLE,
    center: DEFAULT_CENTER,
    zoom: 13,
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

    // Trigger Browser Geolocation to center map close to user position
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLat = position.coords.latitude;
          const userLon = position.coords.longitude;

          console.log(`User Geolocation acquired: ${userLat}, ${userLon}`);

          // Fly map close to user location
          map?.flyTo({
            center: [userLon, userLat],
            zoom: 14,
            speed: 1.5,
            essential: true
          });

          // Set Origin Waypoint to User's Current Location
          if (waypoints.length > 0 && waypoints[0].type === "origin") {
            waypoints[0].lat = userLat;
            waypoints[0].lon = userLon;
            waypoints[0].title = "Current Position";
            renderWaypointsUI();
          }
        },
        (error) => {
          console.warn("Geolocation positioning error or permission denied:", error.message);
          renderWaypointMapMarkers();
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    } else {
      renderWaypointMapMarkers();
    }
  });

  setTimeout(() => {
    map?.resize();
  }, 100);

  setTimeout(() => {
    map?.resize();
  }, 400);
}

// Context Menu Handlers
function copyCoordinatesToClipboard() {
  if (!lastRightClickLngLat) return;
  const coordString = `${lastRightClickLngLat.lat.toFixed(6)}, ${lastRightClickLngLat.lng.toFixed(6)}`;
  navigator.clipboard.writeText(coordString);
  showToast(`Copied ${coordString} to clipboard!`);
  hideContextMenu();
}

if (contextCoordsItem) contextCoordsItem.addEventListener("click", copyCoordinatesToClipboard);

if (contextAddStopBtn) {
  contextAddStopBtn.addEventListener("click", () => {
    if (!lastRightClickLngLat) return;
    const { lat, lng } = lastRightClickLngLat;

    // Calculate optimal logical sequence position based on detour distance
    const insertIndex = findOptimalInsertionIndex(lat, lng);
    insertNewStopAt(insertIndex, lat, lng);

    hideContextMenu();
    showToast(`Added Waystop at ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
  });
}

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

      if (tripTitleText) tripTitleText.textContent = currentTripTitle;
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
