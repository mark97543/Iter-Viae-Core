import "./styles.css";
import maplibregl from "maplibre-gl";
import { pb, SavedTripRecord } from "./pocketbase";
import { assholeVoice, VoiceMode, DialogueCategory } from "./asshole-voice";
import { haversineDistance, formatDistance, formatDuration, fetchExpeditionRoute } from "./valhalla";

console.log("ITER VIAE Mobile Tactical Cockpit initialized.");

// State Variables
let map: maplibregl.Map | null = null;
let vehicleMarker: maplibregl.Marker | null = null;
let waypointMarkers: maplibregl.Marker[] = [];
let currentPosition: { lat: number; lon: number; speedMph: number; heading: number | null } | null = null;
let activeTrip: SavedTripRecord | null = null;
let currentWaypointIndex: number = 0;
let wakeLockSentinel: any = null;
let watchPositionId: number | null = null;
let autoFollowVehicle: boolean = true;
let currentDeviceHeading: number = 0;
let debugMode: boolean = false;

// DOM Elements
const speedDisplay = document.getElementById("speed-display");
const speedWarning = document.getElementById("speed-warning");
const nextWpDistance = document.getElementById("next-wp-distance");
const nextWpTitle = document.getElementById("next-wp-title");
const turnIcon = document.getElementById("turn-icon");
const voiceModeLabel = document.getElementById("voice-mode-label");
const wakelockIndicator = document.getElementById("wakelock-indicator");
const dockDistVal = document.getElementById("dock-dist-val");
const dockEtaVal = document.getElementById("dock-eta-val");
const dockTripTitle = document.getElementById("dock-trip-title");

// Modals & Controls
const mobileTripsModal = document.getElementById("mobile-trips-modal");
const mobileTripsList = document.getElementById("mobile-trips-list");
const tripsLoadingSpinner = document.getElementById("trips-loading-spinner");
const compassOverlay = document.getElementById("compass-overlay");
const compassDial = document.getElementById("compass-dial");
const bearingPointer = document.getElementById("bearing-pointer");
const headingDegDisplay = document.getElementById("heading-deg-display");
const compassWpTarget = document.getElementById("compass-wp-target");

// Buttons & Auth Elements
const btnMobileAuth = document.getElementById("btn-mobile-auth");
const authStatusText = document.getElementById("auth-status-text");
const mobileAuthModal = document.getElementById("mobile-auth-modal");
const authModalClose = document.getElementById("auth-modal-close");
const mobileLoginForm = document.getElementById("mobile-login-form") as HTMLFormElement | null;
const mobileAuthEmail = document.getElementById("mobile-auth-email") as HTMLInputElement | null;
const mobileAuthPassword = document.getElementById("mobile-auth-password") as HTMLInputElement | null;
const authErrorMsg = document.getElementById("auth-error-msg");

const btnDebugToggle = document.getElementById("btn-debug-toggle");
const btnVoiceMode = document.getElementById("btn-voice-mode");
const btnRecenter = document.getElementById("btn-recenter");
const btnCompassToggle = document.getElementById("btn-compass-toggle");
const btnCloseCompass = document.getElementById("btn-close-compass");
const btnOpenTrips = document.getElementById("btn-open-trips");
const btnTestAsshole = document.getElementById("btn-test-asshole");
const btnWakelockToggle = document.getElementById("btn-wakelock-toggle");
const tripsModalClose = document.getElementById("trips-modal-close");

// Initialize MapLibre Engine
function initMobileMap() {
  const mapElement = document.getElementById("mobile-map");
  if (!mapElement) return;

  map = new maplibregl.Map({
    container: "mobile-map",
    style: {
      version: 8,
      sources: {
        "osm-tiles": {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "&copy; OpenStreetMap contributors"
        }
      },
      layers: [
        {
          id: "osm-tiles-layer",
          type: "raster",
          source: "osm-tiles",
          minzoom: 0,
          maxzoom: 19
        }
      ]
    },
    center: [-111.9679844, 43.4704308], // Default Idaho Falls
    zoom: 13,
    pitch: 45,
    attributionControl: false
  });

  map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

  // Create Vehicle Marker Element (Iter Viae Tactical Arrow)
  const vehicleEl = document.createElement("div");
  vehicleEl.className = "vehicle-arrow-marker";
  vehicleEl.innerHTML = `
    <div class="arrow-pulse"></div>
    <div class="arrow-inner" id="vehicle-arrow-icon">
      ▲
    </div>
  `;

  vehicleMarker = new maplibregl.Marker({ element: vehicleEl })
    .setLngLat([-111.9679844, 43.4704308])
    .addTo(map);

  map.on("dragstart", () => {
    autoFollowVehicle = false;
  });

  // Map Click GPS Simulator for Desktop Debugging
  map.on("click", (e) => {
    if (!debugMode) return;

    const lat = e.lngLat.lat;
    const lon = e.lngLat.lng;
    const speedMph = 55;
    const heading = currentPosition
      ? Math.round(calculateBearing(currentPosition.lat, currentPosition.lon, lat, lon))
      : 0;

    currentPosition = { lat, lon, speedMph, heading };

    if (speedDisplay) speedDisplay.textContent = `${speedMph}`;

    if (vehicleMarker && map) {
      vehicleMarker.setLngLat([lon, lat]);
      const arrowInner = document.getElementById("vehicle-arrow-icon");
      if (arrowInner) {
        arrowInner.style.transform = `rotate(${heading}deg)`;
      }
    }

    updateNavigationMetrics();
    if (activeTrip) {
      renderActiveRouteOnMap();
    }

    showToast(`GPS Debugger: Set vehicle to ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
  });

  // Load cached trip if exists offline
  loadCachedTripLocally();
}

// Geolocation Watcher & Navigation Update Loop
function startGPSWatcher() {
  if (!navigator.geolocation) {
    showToast("Geolocation is not supported by this device.");
    return;
  }

  watchPositionId = navigator.geolocation.watchPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const speedMetersPerSec = pos.coords.speed || 0;
      const speedMph = Math.round(speedMetersPerSec * 2.23694);
      const heading = pos.coords.heading || null;

      currentPosition = { lat, lon, speedMph, heading };

      // Update Speedometer UI
      if (speedDisplay) speedDisplay.textContent = `${speedMph}`;
      if (speedWarning) {
        speedWarning.style.display = speedMph > 75 ? "block" : "none";
      }

      // Voice Speeding Alert
      if (speedMph > 75) {
        assholeVoice.trigger("speed_warning");
      }

      // Update Vehicle Marker on Map
      if (vehicleMarker && map) {
        vehicleMarker.setLngLat([lon, lat]);
        const arrowInner = document.getElementById("vehicle-arrow-icon");
        if (arrowInner && heading !== null) {
          arrowInner.style.transform = `rotate(${heading}deg)`;
        }
        if (autoFollowVehicle) {
          map.easeTo({ center: [lon, lat], zoom: 15, duration: 800 });
        }
      }

      // Update Active Navigation Progress
      updateNavigationMetrics();

      // If active trip loaded, dynamically update polyline starting from current position
      if (activeTrip && !map?.getSource("mobile-route")) {
        renderActiveRouteOnMap();
      }
    },
    (err) => {
      console.warn("GPS Location error:", err);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
  );
}

// Navigation & Waypoint Guidance Metrics
function updateNavigationMetrics() {
  if (!activeTrip || !activeTrip.waypoints || activeTrip.waypoints.length === 0) {
    if (nextWpDistance) nextWpDistance.textContent = "-- MI";
    if (nextWpTitle) nextWpTitle.textContent = "No Expedition Loaded";
    if (dockDistVal) dockDistVal.textContent = "-- MI";
    if (dockEtaVal) dockEtaVal.textContent = "--H --M";
    return;
  }

  const validWaypoints = activeTrip.waypoints.filter((w) => w.lat !== null && w.lon !== null);
  if (validWaypoints.length === 0) return;

  // Target Next Waypoint
  const nextWp = validWaypoints[currentWaypointIndex] || validWaypoints[validWaypoints.length - 1];

  if (currentPosition && nextWp) {
    const distToNext = haversineDistance(currentPosition.lat, currentPosition.lon, nextWp.lat, nextWp.lon);
    if (nextWpDistance) nextWpDistance.textContent = formatDistance(distToNext);
    if (nextWpTitle) nextWpTitle.textContent = `NEXT: ${nextWp.title || `Waypoint #${currentWaypointIndex + 1}`}`;

    // Calculate Turn Direction Icon and spoken turn callout
    const bearingToNext = calculateBearing(currentPosition.lat, currentPosition.lon, nextWp.lat, nextWp.lon);
    const relBearing = (bearingToNext - (currentPosition.heading || 0) + 360) % 360;

    let arrowSymbol = "⬆️";
    let turnCategory: DialogueCategory = "turn_straight";

    if (relBearing > 30 && relBearing <= 75) { arrowSymbol = "↗️"; turnCategory = "turn_right"; }
    else if (relBearing > 75 && relBearing <= 115) { arrowSymbol = "➔"; turnCategory = "turn_right"; }
    else if (relBearing > 115 && relBearing <= 160) { arrowSymbol = "↘️"; turnCategory = "turn_right"; }
    else if (relBearing > 160 && relBearing <= 200) { arrowSymbol = "↩️"; turnCategory = "turn_uturn"; }
    else if (relBearing > 200 && relBearing <= 245) { arrowSymbol = "↙️"; turnCategory = "turn_left"; }
    else if (relBearing > 245 && relBearing <= 285) { arrowSymbol = "⬅️"; turnCategory = "turn_left"; }
    else if (relBearing > 285 && relBearing <= 330) { arrowSymbol = "↖️"; turnCategory = "turn_left"; }

    if (turnIcon) turnIcon.textContent = arrowSymbol;

    // Spoken turn announcement on approach or Debugger click
    if (distToNext < 1.5) {
      assholeVoice.trigger(turnCategory);
    }

    // Check Waypoint Arrival Threshold (< 300 feet)
    if (distToNext < 0.06 && currentWaypointIndex < validWaypoints.length - 1) {
      assholeVoice.trigger("waypoint_arrival", `Arriving at waypoint: ${nextWp.title}`);
      currentWaypointIndex++;
      showToast(`Arrived at ${nextWp.title}! Next waypoint set.`);
    }

    // Calculate Total Remaining Distance
    let totalRemainingDist = distToNext;
    for (let i = currentWaypointIndex; i < validWaypoints.length - 1; i++) {
      totalRemainingDist += haversineDistance(
        validWaypoints[i].lat,
        validWaypoints[i].lon,
        validWaypoints[i + 1].lat,
        validWaypoints[i + 1].lon
      );
    }

    const speedForEta = Math.max(currentPosition.speedMph, 45); // Estimate at min 45 mph
    const etaSeconds = (totalRemainingDist / speedForEta) * 3600;

    if (dockDistVal) dockDistVal.textContent = formatDistance(totalRemainingDist);
    if (dockEtaVal) dockEtaVal.textContent = formatDuration(etaSeconds);
    if (compassWpTarget) compassWpTarget.textContent = `TARGET: ${nextWp.title || "Next Waypoint"}`;

    // Off Route Check (> 0.25 miles from nearest leg)
    if (distToNext > 5.0 && currentPosition.speedMph > 20) {
      assholeVoice.trigger("off_route");
    }
  }
}

// Render Active Route & Waypoints on Mobile Map
async function renderActiveRouteOnMap() {
  if (!map || !activeTrip || !activeTrip.waypoints) return;

  // Clear existing markers
  waypointMarkers.forEach((m) => m.remove());
  waypointMarkers = [];

  const valid = activeTrip.waypoints.filter((w) => w.lat !== null && w.lon !== null);
  if (valid.length === 0) return;

  // Add Waypoint Markers
  valid.forEach((wp, idx) => {
    const el = document.createElement("div");
    const isStart = idx === 0;
    const isEnd = idx === valid.length - 1;
    const bgColor = isStart ? "#10b981" : isEnd ? "#ef4444" : "#38bdf8";

    el.innerHTML = `
      <div style="background:${bgColor}; color:#000000; font-family:'JetBrains Mono', monospace; font-size:0.75rem; font-weight:900; padding:4px 8px; border-radius:6px; border:2px solid #ffffff; box-shadow:0 4px 10px rgba(0,0,0,0.5); white-space:nowrap;">
        #${idx + 1} ${wp.title || "Waypoint"}
      </div>
    `;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([wp.lon, wp.lat])
      .addTo(map!);

    waypointMarkers.push(marker);
  });

  // Fit camera bounds ONLY on initial load (pause zooming in Debugger mode to keep current camera)
  if (!debugMode && !map.getSource("mobile-route")) {
    const bounds = new maplibregl.LngLatBounds();
    if (currentPosition) bounds.extend([currentPosition.lon, currentPosition.lat]);
    valid.forEach((wp) => bounds.extend([wp.lon, wp.lat]));
    map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
  }

  // Dynamic Route Points: Point 0 is your LIVE CURRENT LOCATION (where you are at right now!)
  const routePoints: Array<{ lat: number; lon: number }> = [];
  if (currentPosition) {
    routePoints.push({ lat: currentPosition.lat, lon: currentPosition.lon });
  }
  routePoints.push(...valid.map((w) => ({ lat: w.lat!, lon: w.lon! })));

  // Fetch & Render Valhalla Polyline starting from Live Location to all waypoints
  const valhallaData = await fetchExpeditionRoute(routePoints);
  if (valhallaData && valhallaData.trip && valhallaData.trip.legs) {
    const coordinates: [number, number][] = [];
    valhallaData.trip.legs.forEach((leg: any) => {
      if (leg.shape) {
        // Decode polyline shape if available
        const decoded = decodePolyline(leg.shape);
        decoded.forEach((pt) => coordinates.push([pt[1], pt[0]]));
      }
    });

    if (coordinates.length > 0) {
      if (map.getSource("mobile-route")) {
        (map.getSource("mobile-route") as maplibregl.GeoJSONSource).setData({
          type: "Feature",
          geometry: { type: "LineString", coordinates },
          properties: {}
        });
      } else {
        map.addSource("mobile-route", {
          type: "geojson",
          data: {
            type: "Feature",
            geometry: { type: "LineString", coordinates },
            properties: {}
          }
        });

        map.addLayer({
          id: "mobile-route-layer",
          type: "line",
          source: "mobile-route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#38bdf8", "line-width": 6, "line-opacity": 0.85 }
        });
      }
    }
  }
}

// Polyline Decoder Helper for Valhalla precision shapes
function decodePolyline(str: string, precision = 6) {
  let index = 0, lat = 0, lng = 0, coordinates = [], factor = Math.pow(10, precision);
  while (index < str.length) {
    let byte = 0, shift = 0, result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    let deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += deltaLat;

    shift = 0; result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    let deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += deltaLng;

    coordinates.push([lat / factor, lng / factor]);
  }
  return coordinates;
}

// Screen Wake Lock API Manager
async function requestScreenWakeLock() {
  if ("wakeLock" in navigator) {
    try {
      wakeLockSentinel = await (navigator.wakeLock as any).request("screen");
      if (wakelockIndicator) {
        wakelockIndicator.style.borderColor = "#10b981";
        wakelockIndicator.style.color = "#10b981";
      }
      showToast("Screen Wake Lock Active.");

      wakeLockSentinel.addEventListener("release", () => {
        if (wakelockIndicator) {
          wakelockIndicator.style.borderColor = "#ef4444";
          wakelockIndicator.style.color = "#ef4444";
        }
      });
    } catch (err: any) {
      console.warn("Screen Wake Lock request failed:", err.message);
    }
  } else {
    showToast("Wake Lock API not supported in this browser.");
  }
}

// 360° Compass & Gyro Tracking
function initCompassGyro() {
  if (window.DeviceOrientationEvent) {
    window.addEventListener("deviceorientation", (e) => {
      let heading = e.alpha || 0;
      if ((e as any).webkitCompassHeading) {
        heading = (e as any).webkitCompassHeading; // iOS Safari
      }

      currentDeviceHeading = Math.round(heading);

      if (headingDegDisplay) {
        headingDegDisplay.textContent = `${String(currentDeviceHeading).padStart(3, "0")}°`;
      }

      if (compassDial) {
        compassDial.style.transform = `rotate(${-currentDeviceHeading}deg)`;
      }

      // Calculate Target Bearing Pointer to next waypoint
      if (activeTrip && currentPosition) {
        const valid = activeTrip.waypoints.filter((w) => w.lat !== null && w.lon !== null);
        const nextWp = valid[currentWaypointIndex];
        if (nextWp) {
          const bearingToWp = calculateBearing(
            currentPosition.lat,
            currentPosition.lon,
            nextWp.lat,
            nextWp.lon
          );
          const relativePointerDeg = bearingToWp - currentDeviceHeading;
          if (bearingPointer) {
            bearingPointer.style.transform = `rotate(${relativePointerDeg}deg)`;
          }
        }
      }
    });
  }
}

function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const y = Math.sin(dLon) * Math.cos(lat2 * (Math.PI / 180));
  const x =
    Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
    Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos(dLon);

  let brng = Math.atan2(y, x) * (180 / Math.PI);
  return (brng + 360) % 360;
}

// Update Header Auth UI Status
function updateAuthUI() {
  if (pb.authStore.isValid && pb.authStore.model) {
    const user = pb.authStore.model;
    const name = user.email || user.username || "LOGGED IN";
    if (authStatusText) authStatusText.textContent = name.substring(0, 12).toUpperCase();
  } else {
    if (authStatusText) authStatusText.textContent = "SIGN IN";
  }
}

// Load Saved Trips from PocketBase (api.wade-usa.com)
async function loadSavedTripsFromCloud() {
  if (!pb.authStore.isValid) {
    if (mobileTripsModal) mobileTripsModal.style.display = "none";
    if (mobileAuthModal) mobileAuthModal.style.display = "flex";
    showToast("Please sign in to your Iter Viae account to access your routes.");
    return;
  }

  if (!mobileTripsList) return;
  mobileTripsList.innerHTML = "";
  if (tripsLoadingSpinner) tripsLoadingSpinner.style.display = "block";

  try {
    const filter = pb.authStore.model?.id ? `user = "${pb.authStore.model.id}"` : "";

    const records = await pb.collection("trips").getFullList<SavedTripRecord>({
      sort: "-updated",
      filter: filter,
      requestKey: null
    });

    if (tripsLoadingSpinner) tripsLoadingSpinner.style.display = "none";

    if (records.length === 0) {
      mobileTripsList.innerHTML = `<div style="text-align:center; padding:20px; color:#94a3b8; font-family:'JetBrains Mono',monospace;">No saved expedition routes found for your account.</div>`;
      return;
    }

    records.forEach((record) => {
      const card = document.createElement("div");
      card.className = "trip-card";
      const count = (record.waypoints || []).length;

      card.innerHTML = `
        <div class="trip-card-head">
          <span class="trip-title">${record.title || "UNTITLED ROUTE"}</span>
          <span class="badge">${(record.status || "PLANNED").toUpperCase()}</span>
        </div>
        <div class="trip-card-meta">
          <span>📍 ${count} Waypoints</span>
          ${record.metrics?.distance ? `<span> • 📏 ${record.metrics.distance}</span>` : ""}
          ${record.metrics?.duration ? `<span> • ⏱️ ${record.metrics.duration}</span>` : ""}
        </div>
        <button class="btn btn-primary btn-sm" style="margin-top: 8px; width: 100%;">
          📂 Load Route Into Mobile HUD
        </button>
      `;

      card.addEventListener("click", () => {
        setActiveTrip(record);
        if (mobileTripsModal) mobileTripsModal.style.display = "none";
      });

      mobileTripsList.appendChild(card);
    });
  } catch (err: any) {
    if (tripsLoadingSpinner) tripsLoadingSpinner.style.display = "none";
    console.error("Error fetching trips from PocketBase:", err);
    mobileTripsList.innerHTML = `<div style="color:#ef4444; padding:10px; font-family:'JetBrains Mono',monospace;">Failed to connect to PocketBase cloud: ${err.message || "Network error"}</div>`;
  }
}

// Set & Cache Active Expedition Trip
function setActiveTrip(record: SavedTripRecord) {
  activeTrip = record;
  currentWaypointIndex = 0;

  if (dockTripTitle) dockTripTitle.textContent = record.title || "Active Expedition";

  // Cache trip locally in localStorage for offline availability
  try {
    localStorage.setItem("iterviae_active_mobile_trip", JSON.stringify(record));
  } catch (e) {
    console.warn("Failed to cache trip locally:", e);
  }

  renderActiveRouteOnMap();
  assholeVoice.trigger("route_start");
  showToast(`Expedition "${record.title}" loaded into Mobile Cockpit!`);
}

function loadCachedTripLocally() {
  try {
    const cached = localStorage.getItem("iterviae_active_mobile_trip");
    if (cached) {
      const record = JSON.parse(cached) as SavedTripRecord;
      setActiveTrip(record);
    }
  } catch (e) {
    console.warn("No cached trip found.");
  }
}

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

// Event Listeners
if (btnMobileAuth) {
  btnMobileAuth.addEventListener("click", () => {
    if (pb.authStore.isValid) {
      if (confirm("Sign out of your Iter Viae account?")) {
        pb.authStore.clear();
        updateAuthUI();
        showToast("Signed out of Iter Viae account.");
      }
    } else {
      if (mobileAuthModal) mobileAuthModal.style.display = "flex";
    }
  });
}

if (authModalClose) {
  authModalClose.addEventListener("click", () => {
    if (mobileAuthModal) mobileAuthModal.style.display = "none";
  });
}

if (mobileLoginForm) {
  mobileLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!mobileAuthEmail || !mobileAuthPassword) return;

    if (authErrorMsg) authErrorMsg.style.display = "none";

    try {
      const authData = await pb.collection("users").authWithPassword(
        mobileAuthEmail.value.trim(),
        mobileAuthPassword.value
      );

      showToast(`Welcome back, ${authData.record.email || authData.record.username}!`);
      updateAuthUI();
      if (mobileAuthModal) mobileAuthModal.style.display = "none";

      // Automatically open routes modal after successful sign in
      if (mobileTripsModal) mobileTripsModal.style.display = "flex";
      loadSavedTripsFromCloud();
    } catch (err: any) {
      console.error("Login failed:", err);
      if (authErrorMsg) {
        authErrorMsg.textContent = err.message || "Invalid email or password.";
        authErrorMsg.style.display = "block";
      }
    }
  });
}

if (btnDebugToggle) {
  btnDebugToggle.addEventListener("click", () => {
    debugMode = !debugMode;
    btnDebugToggle.classList.toggle("active", debugMode);
    showToast(
      debugMode
        ? "🐛 GPS Debugger ON: Tap anywhere on map to set vehicle location!"
        : "GPS Debugger OFF"
    );
  });
}

if (btnVoiceMode) {
  btnVoiceMode.addEventListener("click", () => {
    const newMode = assholeVoice.toggleMode();
    if (voiceModeLabel) voiceModeLabel.textContent = newMode.toUpperCase();
  });
}

if (btnRecenter) {
  btnRecenter.addEventListener("click", () => {
    autoFollowVehicle = true;
    if (currentPosition && map) {
      map.flyTo({ center: [currentPosition.lon, currentPosition.lat], zoom: 15 });
    }
  });
}

if (btnCompassToggle) {
  btnCompassToggle.addEventListener("click", () => {
    if (compassOverlay) compassOverlay.style.display = "flex";
  });
}

if (btnCloseCompass) {
  btnCloseCompass.addEventListener("click", () => {
    if (compassOverlay) compassOverlay.style.display = "none";
  });
}

if (btnOpenTrips) {
  btnOpenTrips.addEventListener("click", () => {
    if (mobileTripsModal) mobileTripsModal.style.display = "flex";
    loadSavedTripsFromCloud();
  });
}

if (tripsModalClose) {
  tripsModalClose.addEventListener("click", () => {
    if (mobileTripsModal) mobileTripsModal.style.display = "none";
  });
}

if (btnTestAsshole) {
  btnTestAsshole.addEventListener("click", () => {
    assholeVoice.trigger("voice_test", undefined, true);
  });
}

if (btnWakelockToggle) {
  btnWakelockToggle.addEventListener("click", () => {
    requestScreenWakeLock();
  });
}

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
  initMobileMap();
  startGPSWatcher();
  initCompassGyro();
  requestScreenWakeLock();
  updateAuthUI();

  // Unlock Speech Synthesis on first user click/tap anywhere on page
  document.addEventListener("click", () => assholeVoice.unlockSpeech());
  document.addEventListener("touchstart", () => assholeVoice.unlockSpeech());
});
