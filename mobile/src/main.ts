import "./styles.css";
import maplibregl from "maplibre-gl";
import { pb, SavedTripRecord } from "./pocketbase";
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
let lastSpokenTurnCategory: string = "";
let lastSpokenTurnKey: string = "";
let activeRouteCoordinates: [number, number][] = [];

// DOM Elements
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

// Arrival Modal Elements
const mobileArrivalModal = document.getElementById("mobile-arrival-modal");
const arrivalModalClose = document.getElementById("arrival-modal-close");
const arrivalWpTitle = document.getElementById("arrival-wp-title");
const arrivalWpCoords = document.getElementById("arrival-wp-coords");
const arrivalWpNotes = document.getElementById("arrival-wp-notes");
const btnReadNotes = document.getElementById("btn-read-notes");
const btnCompleteWaypoint = document.getElementById("btn-complete-waypoint");
let activeArrivalWp: any = null;
let carouselActiveIndex: number = 0;

// Dashboard UI Elements (Matching wade-usa.com Screenshot Exactly)
const dashRouteTitle = document.getElementById("dash-route-title");
const dashRoutePct = document.getElementById("dash-route-pct");
const dashProgressFill = document.getElementById("dash-progress-fill");

const dashCurrTitle = document.getElementById("dash-curr-title");
const dashCurrDepart = document.getElementById("dash-curr-depart");
const dashCurrBudget = document.getElementById("dash-curr-budget");

const dashNextTitle = document.getElementById("dash-next-title");
const dashNextArrival = document.getElementById("dash-next-arrival");
const dashNextPill = document.getElementById("dash-next-pill");

const dashNotesText = document.getElementById("dash-notes-text");

const btnDashPrev = document.getElementById("btn-dash-prev");
const btnDashNext = document.getElementById("btn-dash-next");
const btnDashGmaps = document.getElementById("btn-dash-gmaps");

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
      if (activeTrip) {
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
    let turnCategory: string = "turn_straight";

    if (relBearing > 30 && relBearing <= 75) { arrowSymbol = "↗️"; turnCategory = "turn_right"; }
    else if (relBearing > 75 && relBearing <= 115) { arrowSymbol = "➔"; turnCategory = "turn_right"; }
    else if (relBearing > 115 && relBearing <= 160) { arrowSymbol = "↘️"; turnCategory = "turn_right"; }
    else if (relBearing > 160 && relBearing <= 200) { arrowSymbol = "↩️"; turnCategory = "turn_uturn"; }
    else if (relBearing > 200 && relBearing <= 245) { arrowSymbol = "↙️"; turnCategory = "turn_left"; }
    else if (relBearing > 245 && relBearing <= 285) { arrowSymbol = "⬅️"; turnCategory = "turn_left"; }
    else if (relBearing > 285 && relBearing <= 330) { arrowSymbol = "↖️"; turnCategory = "turn_left"; }

    if (turnIcon) turnIcon.textContent = arrowSymbol;

    const milestoneInfo = getDistanceMilestoneKey(distToNext);

    if (milestoneInfo) {
      const { phrase: distPhrase, key: milestoneKey } = milestoneInfo;
      let turnAction = "continue straight";
      if (turnCategory === "turn_right") turnAction = "turn right";
      else if (turnCategory === "turn_left") turnAction = "turn left";
      else if (turnCategory === "turn_uturn") turnAction = "make a U-turn";

      // Compound Maneuver Check (e.g. Turn Right then Quick Left within 500 ft)
      const followingWp = validWaypoints[currentWaypointIndex + 1];
      let compoundAction = "";

      if (followingWp) {
        const distBetweenWaypoints = haversineDistance(nextWp.lat, nextWp.lon, followingWp.lat, followingWp.lon);
        if (distBetweenWaypoints < 0.1) {
          const bearingSecond = calculateBearing(nextWp.lat, nextWp.lon, followingWp.lat, followingWp.lon);
          const relBearingSecond = (bearingSecond - bearingToNext + 360) % 360;

          let secondTurn = "";
          if (relBearingSecond > 30 && relBearingSecond <= 160) secondTurn = "then turn immediate right";
          else if (relBearingSecond > 200 && relBearingSecond <= 330) secondTurn = "then turn immediate left";

          if (secondTurn) {
            compoundAction = `, ${secondTurn}`;
          }
        }
      }

      const customTurnSpeech = `${distPhrase}, ${turnAction}${compoundAction}.`;
      const turnKey = `${currentWaypointIndex}_${turnCategory}_${milestoneKey}`;

      // Spoken turn announcement: Trigger ONCE per approach milestone (1mile -> 1000ft -> 500ft -> 200ft)
      if (turnKey !== lastSpokenTurnKey) {
        lastSpokenTurnKey = turnKey;
      }
    }

    // Check Waypoint Arrival Threshold (< 80 feet = 0.015 miles)
    if (distToNext < 0.015 && currentWaypointIndex < validWaypoints.length) {
      if (isShapingPoint(nextWp)) {
        // Shaping point: Pass right through without stopping
        currentWaypointIndex++;
        showToast(`Passed shaping point "${nextWp.title || `Point #${currentWaypointIndex}`}".`);
        renderActiveRouteOnMap();
      } else {
        // Major Checkpoint / Stop: Open Arrival Screen Modal
        if (!mobileArrivalModal || mobileArrivalModal.style.display !== "flex") {
          activeArrivalWp = nextWp;
          if (arrivalWpTitle) arrivalWpTitle.textContent = nextWp.title || `CHECKPOINT #${currentWaypointIndex + 1}`;
          if (arrivalWpCoords) arrivalWpCoords.textContent = `LAT: ${nextWp.lat.toFixed(4)} | LON: ${nextWp.lon.toFixed(4)}`;
          if (arrivalWpNotes) arrivalWpNotes.textContent = nextWp.notes || nextWp.description || nextWp.briefing || "No field notes or briefing provided for this checkpoint.";
          
          if (mobileArrivalModal) mobileArrivalModal.style.display = "flex";
        }
      }
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
  }
}

// Standard GPS approach milestones (200ft, 500ft, 1000ft, 1mile). Returns null if > 1.2 miles away
function getDistanceMilestoneKey(miles: number): { phrase: string; key: string } | null {
  const feet = Math.round(miles * 5280);
  if (feet < 350) return { phrase: "In 200 feet", key: "200ft" };
  if (feet < 850) return { phrase: "In 500 feet", key: "500ft" };
  if (feet < 1800) return { phrase: "In 1000 feet", key: "1000ft" };
  if (miles < 1.2) return { phrase: "In 1 mile", key: "1mile" };
  return null;
}

// Helper: Check if waypoint is a Shaping Point
function isShapingPoint(wp: any): boolean {
  if (!wp) return false;
  if (wp.isShaping === true || wp.type === "shaping" || wp.type === "via") return true;
  const title = (wp.title || "").toLowerCase();
  return title.includes("shaping") || title.includes("via point");
}

// Render Expedition Dashboard Card Deck (Matches wade-usa.com Screenshot Exactly)
function renderDashboardDeck(focusMap = false) {
  if (!activeTrip || !activeTrip.waypoints || activeTrip.waypoints.length === 0) {
    if (dashRouteTitle) dashRouteTitle.textContent = "SELECT AN EXPEDITION ROUTE";
    if (dashRoutePct) dashRoutePct.textContent = "0%";
    if (dashProgressFill) dashProgressFill.style.width = "0%";
    if (dashCurrTitle) dashCurrTitle.textContent = "No Expedition Active";
    if (dashNextTitle) dashNextTitle.textContent = "Load Route to Start";
    return;
  }

  const valid = activeTrip.waypoints.filter((w) => w.lat !== null && w.lon !== null);
  if (valid.length === 0) return;

  if (currentWaypointIndex >= valid.length) currentWaypointIndex = valid.length - 1;
  if (currentWaypointIndex < 0) currentWaypointIndex = 0;

  const currWp = valid[currentWaypointIndex];
  const nextWp = valid[Math.min(currentWaypointIndex + 1, valid.length - 1)];

  // Route Progress Bar
  const pct = Math.round((currentWaypointIndex / Math.max(1, valid.length - 1)) * 100);
  if (dashRouteTitle) dashRouteTitle.textContent = `${activeTrip.title || "EXPEDITION ROUTE"}`;
  if (dashRoutePct) dashRoutePct.textContent = `${pct}%`;
  if (dashProgressFill) dashProgressFill.style.width = `${pct}%`;

  // CURRENT LOCATION SECTION
  if (dashCurrTitle) dashCurrTitle.textContent = currWp.title || `Checkpoint #${currentWaypointIndex + 1}`;
  if (dashCurrDepart) dashCurrDepart.textContent = currWp.departTime || "May 29 @ 09:57 PM";
  if (dashCurrBudget) {
    const budgetVal = currWp.budget !== undefined ? currWp.budget : "10.00";
    dashCurrBudget.textContent = `$${budgetVal}`;
  }

  // NEXT DESTINATION SECTION
  if (dashNextTitle) {
    if (currentWaypointIndex === valid.length - 1) {
      dashNextTitle.textContent = "🏁 Final Destination Reached";
    } else {
      dashNextTitle.textContent = nextWp.title || `Checkpoint #${currentWaypointIndex + 2}`;
    }
  }

  // Distance & Duration calculation for pill badge (Direct Leg from Current Stop -> Next Stop)
  if (currWp && nextWp && currentWaypointIndex < valid.length - 1) {
    let fromLat = currWp.lat!;
    let fromLon = currWp.lon!;
    
    // Use live GPS position only if vehicle is close to the active stop (< 5 miles)
    if (currentPosition) {
      const distToCurr = haversineDistance(currentPosition.lat, currentPosition.lon, currWp.lat!, currWp.lon!);
      if (distToCurr < 5.0) {
        fromLat = currentPosition.lat;
        fromLon = currentPosition.lon;
      }
    }

    const legMiles = haversineDistance(fromLat, fromLon, nextWp.lat!, nextWp.lon!);
    const totalMinutes = Math.round((legMiles / 45) * 60);
    const estHours = Math.floor(totalMinutes / 60);
    const estMins = totalMinutes % 60;
    const timeStr = estHours > 0 ? `${estHours}h ${estMins}m` : `${estMins}m`;

    if (dashNextPill) dashNextPill.textContent = `${legMiles.toFixed(1)}mi • ${timeStr}`;
  } else if (dashNextPill) {
    dashNextPill.textContent = "0.0mi • 0m";
  }

  if (dashNextArrival) {
    dashNextArrival.textContent = (nextWp && nextWp.eta) ? nextWp.eta : "May 29 @ 10:44 PM";
  }

  // BRIEFING / NOTES BOX
  if (dashNotesText) {
    dashNotesText.textContent = currWp.notes || currWp.description || currWp.briefing || currWp.title || "No field notes provided for this stop.";
  }

  if (focusMap && map && currWp.lat && currWp.lon) {
    map.easeTo({ center: [currWp.lon, currWp.lat], zoom: 14, duration: 400 });
  }
}

// Deep-Link Navigation into Google Maps App from Current Location -> Next Destination
function openInGoogleMaps(destLat: number, destLon: number, originLat?: number, originLon?: number) {
  let url = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLon}&travelmode=driving`;
  if (currentPosition) {
    url += `&origin=${currentPosition.lat},${currentPosition.lon}`;
  } else if (originLat !== undefined && originLon !== undefined) {
    url += `&origin=${originLat},${originLon}`;
  }
  window.open(url, "_blank");
}

// Render Active Route & Waypoints on Mobile Map
async function renderActiveRouteOnMap() {
  if (!map || !activeTrip || !activeTrip.waypoints) return;

  // Clear existing markers
  waypointMarkers.forEach((m) => m.remove());
  waypointMarkers = [];

  const valid = activeTrip.waypoints.filter((w) => w.lat !== null && w.lon !== null);
  if (valid.length === 0) return;

  // Add Markers ONLY for remaining uncompleted waypoints
  const remainingWaypoints = valid.slice(currentWaypointIndex);

  remainingWaypoints.forEach((wp, relIdx) => {
    const absIdx = currentWaypointIndex + relIdx;
    const el = document.createElement("div");
    const isStart = relIdx === 0;
    const isEnd = relIdx === remainingWaypoints.length - 1;
    const bgColor = isStart ? "#10b981" : isEnd ? "#ef4444" : "#38bdf8";
    const shapingBadge = isShapingPoint(wp) ? " 📍" : "";

    el.innerHTML = `
      <div style="background:${bgColor}; color:#000000; font-family:'JetBrains Mono', monospace; font-size:0.75rem; font-weight:900; padding:4px 8px; border-radius:6px; border:2px solid #ffffff; box-shadow:0 4px 10px rgba(0,0,0,0.5); white-space:nowrap;">
        #${absIdx + 1} ${wp.title || "Waypoint"}${shapingBadge}
      </div>
    `;

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([wp.lon, wp.lat])
      .addTo(map!);

    waypointMarkers.push(marker);
  });

  if (!map.getSource("mobile-route")) {
    const bounds = new maplibregl.LngLatBounds();
    if (currentPosition) bounds.extend([currentPosition.lon, currentPosition.lat]);
    valid.forEach((wp) => bounds.extend([wp.lon, wp.lat]));
    map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
  }

  // Dynamic Route Points: Point 0 is your LIVE CURRENT LOCATION -> remaining waypoints
  const routePoints: Array<{ lat: number; lon: number }> = [];
  if (currentPosition) {
    routePoints.push({ lat: currentPosition.lat, lon: currentPosition.lon });
  }
  routePoints.push(...remainingWaypoints.map((w) => ({ lat: w.lat!, lon: w.lon! })));

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
      activeRouteCoordinates = coordinates;
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
  carouselActiveIndex = 0;

  if (dockTripTitle) dockTripTitle.textContent = record.title || "Active Expedition";

  // Cache trip locally in localStorage for offline availability
  try {
    localStorage.setItem("iterviae_active_mobile_trip", JSON.stringify(record));
  } catch (e) {
    console.warn("Failed to cache trip locally:", e);
  }

  renderActiveRouteOnMap();
  renderDashboardDeck(true);
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

// Arrival Modal Listeners
if (arrivalModalClose) {
  arrivalModalClose.addEventListener("click", () => {
    if (mobileArrivalModal) mobileArrivalModal.style.display = "none";
  });
}

if (btnReadNotes) {
  btnReadNotes.addEventListener("click", () => {
    if (arrivalWpNotes && arrivalWpNotes.textContent) {
      showToast(arrivalWpNotes.textContent);
    }
  });
}

if (btnCompleteWaypoint) {
  btnCompleteWaypoint.addEventListener("click", () => {
    currentWaypointIndex++;
    if (mobileArrivalModal) mobileArrivalModal.style.display = "none";
    showToast("Checkpoint completed! Route updated.");
    renderActiveRouteOnMap();
  });
}

const btnToggleAuthMode = document.getElementById("btn-toggle-auth-mode");
const btnSubmitAuth = document.getElementById("btn-submit-auth");
const authModalTitle = document.getElementById("auth-modal-title");
const authModalSubtitle = document.getElementById("auth-modal-subtitle");
let isSignUpMode = false;

if (btnToggleAuthMode) {
  btnToggleAuthMode.addEventListener("click", () => {
    isSignUpMode = !isSignUpMode;
    if (authModalTitle) authModalTitle.textContent = isSignUpMode ? "CREATE ITER VIAE ACCOUNT" : "ITER VIAE ACCOUNT AUTH";
    if (authModalSubtitle) authModalSubtitle.textContent = isSignUpMode ? "Create an account to save and sync expedition routes" : "Sign in to access your saved expedition routes";
    if (btnSubmitAuth) btnSubmitAuth.textContent = isSignUpMode ? "✨ Create Account & Sign In" : "🚀 Sign In to Iter Viae";
    if (btnToggleAuthMode) btnToggleAuthMode.textContent = isSignUpMode ? "Already have an account? Sign in here" : "Need an account? Create one here";
    if (authErrorMsg) authErrorMsg.style.display = "none";
  });
}

if (mobileLoginForm) {
  mobileLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!mobileAuthEmail || !mobileAuthPassword) return;

    if (authErrorMsg) authErrorMsg.style.display = "none";
    const emailVal = mobileAuthEmail.value.trim();
    const passVal = mobileAuthPassword.value;

    try {
      if (isSignUpMode) {
        // Create new PocketBase account
        await pb.collection("users").create({
          email: emailVal,
          password: passVal,
          passwordConfirm: passVal
        });
        showToast("Account created successfully! Signing in...");
      }

      // Authenticate with credentials
      const authData = await pb.collection("users").authWithPassword(emailVal, passVal);

      showToast(`Welcome back, ${authData.record.email || authData.record.username}!`);
      updateAuthUI();
      if (mobileAuthModal) mobileAuthModal.style.display = "none";

      // Automatically open routes modal after successful sign in
      if (mobileTripsModal) mobileTripsModal.style.display = "flex";
      loadSavedTripsFromCloud();
    } catch (err: any) {
      console.error("Auth process failed:", err);
      let detailedMsg = err.message || "Authentication failed.";

      if (err.data && typeof err.data === "object") {
        const details: string[] = [];
        for (const k of Object.keys(err.data)) {
          if (err.data[k]?.message) {
            details.push(`${k}: ${err.data[k].message}`);
          }
        }
        if (details.length > 0) {
          detailedMsg += ` — ${details.join(", ")}`;
        }
      }

      if (authErrorMsg) {
        authErrorMsg.textContent = detailedMsg;
        authErrorMsg.style.display = "block";
      }
    }
  });
}

// Dashboard Action Button Handlers (Matching wade-usa.com Screenshot Exactly)
if (btnDashPrev) {
  btnDashPrev.addEventListener("click", () => {
    if (!activeTrip || !activeTrip.waypoints) return;
    const valid = activeTrip.waypoints.filter((w) => w.lat !== null && w.lon !== null);
    if (valid.length === 0) return;
    currentWaypointIndex = Math.max(0, currentWaypointIndex - 1);
    renderDashboardDeck(true);
  });
}

if (btnDashNext) {
  btnDashNext.addEventListener("click", () => {
    if (!activeTrip || !activeTrip.waypoints) return;
    const valid = activeTrip.waypoints.filter((w) => w.lat !== null && w.lon !== null);
    if (valid.length === 0) return;
    currentWaypointIndex = Math.min(valid.length - 1, currentWaypointIndex + 1);
    renderDashboardDeck(true);
  });
}

if (btnDashGmaps) {
  btnDashGmaps.addEventListener("click", () => {
    if (!activeTrip || !activeTrip.waypoints) return;
    const valid = activeTrip.waypoints.filter((w) => w.lat !== null && w.lon !== null);
    const currWp = valid[currentWaypointIndex];
    const targetWp = valid[Math.min(currentWaypointIndex + 1, valid.length - 1)];
    if (targetWp && targetWp.lat !== null && targetWp.lon !== null) {
      showToast(`Launching Google Maps navigation to ${targetWp.title || "Next Stop"}...`);
      openInGoogleMaps(
        targetWp.lat,
        targetWp.lon,
        currWp && currWp.lat !== null ? currWp.lat : undefined,
        currWp && currWp.lon !== null ? currWp.lon : undefined
      );
    }
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

if (btnWakelockToggle) {
  btnWakelockToggle.addEventListener("click", () => {
    requestScreenWakeLock();
  });
}

// 1. Service Worker PWA Registration for Offline Caching
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(
      (reg) => console.log("Iter Viae ServiceWorker registered:", reg.scope),
      (err) => console.warn("Iter Viae ServiceWorker registration failed:", err)
    );
  });
}

// 2. Sunlight / Night OLED Theme Toggle Logic
const btnThemeToggle = document.getElementById("btn-theme-toggle");
const themeLabel = document.getElementById("theme-label");

if (btnThemeToggle) {
  btnThemeToggle.addEventListener("click", () => {
    const isDay = document.body.classList.toggle("theme-day");
    if (themeLabel) {
      themeLabel.textContent = isDay ? "NIGHT" : "DAY";
    }
    const icon = btnThemeToggle.querySelector("span");
    if (icon) {
      icon.textContent = isDay ? "🌙" : "☀️";
    }
    showToast(isDay ? "☀️ Sunlight Day Mode Engaged" : "🌙 Night OLED Mode Engaged");
  });
}

// 3. Glove-Friendly Touch Swipe Gestures on Dashboard Deck
const dashDeckEl = document.getElementById("dash-cockpit-deck");
let touchStartX = 0;
let touchStartY = 0;

if (dashDeckEl) {
  dashDeckEl.addEventListener("touchstart", (e: TouchEvent) => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  dashDeckEl.addEventListener("touchend", (e: TouchEvent) => {
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;

    if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX < 0) {
        // Swipe Left -> Next Leg
        if (btnDashNext) (btnDashNext as HTMLElement).click();
      } else {
        // Swipe Right -> Previous Leg
        if (btnDashPrev) (btnDashPrev as HTMLElement).click();
      }
    }
  }, { passive: true });
}

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
  initMobileMap();
  startGPSWatcher();
  initCompassGyro();
  requestScreenWakeLock();
  updateAuthUI();
});
