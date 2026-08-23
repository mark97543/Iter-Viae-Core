import "./styles.css";
import maplibregl from "maplibre-gl";
import { pb, SavedTripRecord } from "./pocketbase";
import { assholeVoice, VoiceMode } from "./asshole-voice";
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

// Buttons
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

  // Fit camera bounds to show full route
  const bounds = new maplibregl.LngLatBounds();
  if (currentPosition) bounds.extend([currentPosition.lon, currentPosition.lat]);
  valid.forEach((wp) => bounds.extend([wp.lon, wp.lat]));
  map.fitBounds(bounds, { padding: 60, maxZoom: 14 });

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

// Load Saved Trips from PocketBase (api.wade-usa.com)
async function loadSavedTripsFromCloud() {
  if (!mobileTripsList) return;
  mobileTripsList.innerHTML = "";
  if (tripsLoadingSpinner) tripsLoadingSpinner.style.display = "block";

  try {
    const records = await pb.collection("trips").getFullList<SavedTripRecord>({
      sort: "-updated",
      requestKey: null
    });

    if (tripsLoadingSpinner) tripsLoadingSpinner.style.display = "none";

    if (records.length === 0) {
      mobileTripsList.innerHTML = `<div style="text-align:center; padding:20px; color:#94a3b8; font-family:'JetBrains Mono',monospace;">No saved expedition routes found on PocketBase cloud.</div>`;
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
});
