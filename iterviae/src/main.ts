import "./styles.css";
import maplibregl from "maplibre-gl";
import { pb, PocketBaseAuth } from "./pocketbase";
import { fetchExpeditionRoute, haversineDistance, LegMetric } from "./valhalla";

console.log("Iter Viae Tactical Surface initialized - Click-to-Focus Waypoint Engine.");

export type StopCategory = "general" | "gas" | "lodging" | "restaurant" | "attraction" | "shopping";

// Waypoint Data Interface
interface Waypoint {
  id: string;
  title: string;
  lat: number | null;
  lon: number | null;
  type: "origin" | "stop" | "destination";
  category?: StopCategory;
  breakMin?: number;
  budget?: number;
  notes?: string;
  isOvernight?: boolean;
  overnightDepartHour?: number;
  isFuelStop?: boolean;
}

const CATEGORY_DETAILS: Record<StopCategory, { label: string; icon: string; color: string; defaultBreak: number }> = {
  general: { label: "General Stop", icon: "📍", color: "#38bdf8", defaultBreak: 15 },
  gas: { label: "Gas / Refuel", icon: "⛽", color: "#f59e0b", defaultBreak: 15 },
  lodging: { label: "Lodging (Overnight)", icon: "🏨", color: "#a855f7", defaultBreak: 0 },
  restaurant: { label: "Restaurant / Dining", icon: "🍽️", color: "#fb923c", defaultBreak: 45 },
  attraction: { label: "Attraction / Sightseeing", icon: "⛰️", color: "#06b6d4", defaultBreak: 60 },
  shopping: { label: "Shopping / Supplies", icon: "🛒", color: "#10b981", defaultBreak: 30 }
};

function getCategoryForWaypoint(wp: Waypoint): StopCategory {
  if (wp.category) return wp.category;
  if (wp.isFuelStop) return "gas";
  if (wp.isOvernight) return "lodging";
  return "general";
}

function setWaypointCategory(wp: Waypoint, category: StopCategory) {
  wp.category = category;
  wp.isFuelStop = category === "gas";
  wp.isOvernight = category === "lodging";

  const details = CATEGORY_DETAILS[category];
  if (details && (wp.breakMin === undefined || wp.breakMin === 15 || wp.breakMin === 0)) {
    wp.breakMin = details.defaultBreak;
  }
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

// DOM Itinerary Modal References
const openItineraryBtn = document.getElementById("open-itinerary-btn");
const itineraryModal = document.getElementById("itinerary-modal");
const itineraryModalClose = document.getElementById("itinerary-modal-close");
const itineraryTripTitle = document.getElementById("itinerary-trip-title");
const itineraryStartTimeInput = document.getElementById("itinerary-start-time") as HTMLInputElement;
const exportCsvBtn = document.getElementById("export-csv-btn");
const resetBreaksBtn = document.getElementById("reset-breaks-btn");
const itineraryTableBody = document.getElementById("itinerary-table-body");

const itinSumDays = document.getElementById("itin-sum-days");
const itinSumTravel = document.getElementById("itin-sum-travel");
const itinSumBreak = document.getElementById("itin-sum-break");
const itinSumTotal = document.getElementById("itin-sum-total");
const itinSumDist = document.getElementById("itin-sum-dist");
const itinSumBudget = document.getElementById("itin-sum-budget");
const itinSumFuel = document.getElementById("itin-sum-fuel");

// DOM Vehicle Fuel Profile & Modal References
const navVehicleBtn = document.getElementById("nav-vehicle-btn");
const openVehicleBtn = document.getElementById("open-vehicle-btn");
const vehicleModal = document.getElementById("vehicle-modal");
const vehicleModalClose = document.getElementById("vehicle-modal-close");

const fuelMpgInput = document.getElementById("fuel-mpg-input") as HTMLInputElement;
const tankCapacityInput = document.getElementById("tank-capacity-input") as HTMLInputElement;
const fuelPriceInput = document.getElementById("fuel-price-input") as HTMLInputElement;
const reserveGalInput = document.getElementById("reserve-gal-input") as HTMLInputElement;
const fuelTrackingToggle = document.getElementById("fuel-tracking-toggle") as HTMLInputElement;
const fuelMaxRange = document.getElementById("fuel-max-range");
const fuelReqGal = document.getElementById("fuel-req-gal");
const fuelEstCost = document.getElementById("fuel-est-cost");

// DOM Saved Trips Logbook Modal References
const navSavedTripsBtn = document.getElementById("nav-saved-trips-btn");
const openSavedTripsBtn = document.getElementById("open-saved-trips-btn");
const savedTripsModal = document.getElementById("saved-trips-modal");
const savedTripsModalClose = document.getElementById("saved-trips-modal-close");
const savedTripsLoading = document.getElementById("saved-trips-loading");
const savedTripsEmpty = document.getElementById("saved-trips-empty");
const savedTripsList = document.getElementById("saved-trips-list");

// DOM Context Menu & Toast References
const contextMenu = document.getElementById("context-menu");
const contextCoordsText = document.getElementById("context-coords-text");
const contextCoordsItem = document.getElementById("context-coords-item");
const contextAddStopBtn = document.getElementById("context-add-stop-btn");
const toastFeedback = document.getElementById("toast-feedback");

export interface VehicleProfile {
  mpg: number;
  tankCapacityGal: number;
  fuelPricePerGal: number;
  reserveGal: number;
  enabled?: boolean;
}

// Global State References
let map: maplibregl.Map | null = null;
let searchMarker: maplibregl.Marker | null = null;
let waypointMapMarkers: { id: string; marker: maplibregl.Marker }[] = [];
let lastRightClickLngLat: { lat: number; lng: number } | null = null;
let toastTimeout: any = null;
let draggedWaypointIndex: number | null = null;
let currentLegMetrics: LegMetric[] = [];
let lastRouteCoordinates: [number, number][] = [];
let currentTripId: string | null = null; // Tracks active PocketBase saved trip ID

let vehicleProfile: VehicleProfile = {
  mpg: 18.0,
  tankCapacityGal: 20.0,
  fuelPricePerGal: 3.65,
  reserveGal: 2.0,
  enabled: true
};

// Expedition State - Completely Blank Canvas
let currentTripTitle = "MY EXPEDITION ROUTE";
let currentTripSummary = "";

let waypoints: Waypoint[] = [
  { id: "wp-origin", title: "", lat: null, lon: null, type: "origin" },
  { id: "wp-dest", title: "", lat: null, lon: null, type: "destination" }
];

const DEFAULT_CENTER: [number, number] = [-104.9903, 39.7392]; // Fallback map center

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

// Initial default start date-time generator (Local ISO YYYY-MM-DDTHH:mm)
function getInitialStartDateTime(): string {
  const now = new Date();
  now.setMinutes(0, 0, 0); // top of hour
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tzOffset).toISOString().slice(0, 16);
}

let expeditionStartTime = getInitialStartDateTime();

// Format Time Only for compact clean spreadsheet cells (e.g. 08:30 AM)
function formatTimeOnly(date: Date): string {
  if (isNaN(date.getTime())) return "--:--";
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${hours}:${minutes} ${ampm}`;
}

// Format Readable Date Time for Excel Tooltips & CSV
function formatDateTimeReadable(date: Date): string {
  if (isNaN(date.getTime())) return "--:--";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayName = days[date.getDay()];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthName = months[date.getMonth()];
  const dayNum = date.getDate();

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;

  return `${dayName} ${monthName} ${dayNum}, ${hours}:${minutes} ${ampm}`;
}

// Format Full Date for Multi-Day Banner Headers
function formatDayHeaderDate(date: Date): string {
  if (isNaN(date.getTime())) return "DAY";
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = days[date.getDay()];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthName = months[date.getMonth()];
  const dayNum = date.getDate();
  const year = date.getFullYear();
  return `${dayName}, ${monthName} ${dayNum}, ${year}`;
}

// Dynamic recalculation of ETAs, Departures, and Summary Bar without rebuilding DOM elements (preserves focus)
function updateItineraryCalculations() {
  let startMillis = Date.parse(itineraryStartTimeInput?.value || expeditionStartTime);
  if (isNaN(startMillis)) {
    startMillis = Date.now();
  }

  let currentMillis = startMillis;
  let totalTravelSec = 0;
  let totalBreakMin = 0;
  let totalDistanceMi = 0;
  let totalBudget = 0;
  let currentDay = 1;

  waypoints.forEach((wp, idx) => {
    let legTravelSec = 0;
    let legDistanceMi = 0;

    if (idx > 0) {
      const legMetric = currentLegMetrics[idx - 1];
      if (legMetric) {
        legTravelSec = legMetric.durationSec;
        legDistanceMi = legMetric.distanceMi;
      }
    }

    totalTravelSec += legTravelSec;
    totalDistanceMi += legDistanceMi;
    currentMillis += legTravelSec * 1000;

    const etaDate = new Date(currentMillis);

    if (idx > 0 && waypoints[idx - 1].isOvernight) {
      currentDay++;
    }

    const isOvernight = Boolean(wp.isOvernight);
    const overnightDepartHour = wp.overnightDepartHour !== undefined ? wp.overnightDepartHour : 8;

    let breakMin = 0;
    let departDate: Date;

    if (isOvernight) {
      const targetDepart = new Date(etaDate);
      targetDepart.setDate(targetDepart.getDate() + 1);
      targetDepart.setHours(overnightDepartHour, 0, 0, 0);

      if (targetDepart.getTime() <= currentMillis) {
        targetDepart.setDate(targetDepart.getDate() + 1);
      }

      const departMillis = targetDepart.getTime();
      breakMin = Math.round((departMillis - currentMillis) / 60000);
      departDate = targetDepart;
      currentMillis = departMillis;
    } else {
      breakMin = wp.breakMin !== undefined ? wp.breakMin : (wp.type === "origin" ? 0 : wp.type === "destination" ? 0 : 15);
      const departMillis = currentMillis + breakMin * 60 * 1000;
      departDate = new Date(departMillis);
      currentMillis = departMillis;
    }

    totalBreakMin += breakMin;

    const budget = wp.budget !== undefined ? wp.budget : 0;
    totalBudget += budget;

    const etaTd = document.getElementById(`itin-eta-${wp.id}`);
    if (etaTd) {
      etaTd.textContent = formatTimeOnly(etaDate);
      etaTd.title = formatDateTimeReadable(etaDate);
    }

    const departTd = document.getElementById(`itin-depart-${wp.id}`);
    if (departTd) {
      departTd.textContent = formatTimeOnly(departDate);
      departTd.title = formatDateTimeReadable(departDate);
    }
  });

  const totalNights = Math.max(0, currentDay - 1);
  if (itinSumDays) itinSumDays.textContent = `${currentDay} ${currentDay === 1 ? 'DAY' : 'DAYS'} (${totalNights} ${totalNights === 1 ? 'NIGHT' : 'NIGHTS'})`;
  if (itinSumTravel) itinSumTravel.textContent = formatDuration(totalTravelSec);
  if (itinSumBreak) itinSumBreak.textContent = formatDuration(totalBreakMin * 60);
  if (itinSumTotal) itinSumTotal.textContent = formatDuration(totalTravelSec + totalBreakMin * 60);
  if (itinSumDist) itinSumDist.textContent = `${totalDistanceMi.toFixed(1)} MI`;
  if (itinSumBudget) itinSumBudget.textContent = `$${totalBudget.toFixed(2)}`;
}

// Render Itinerary Excel Spreadsheet Grid Table & Summary Row with Multi-Day Support
function renderItinerarySpreadsheet() {
  if (!itineraryTableBody) return;

  if (itineraryTripTitle) {
    itineraryTripTitle.textContent = currentTripTitle || "EXPEDITION ITINERARY PLANNER";
  }

  if (itineraryStartTimeInput && !itineraryStartTimeInput.value) {
    itineraryStartTimeInput.value = expeditionStartTime;
  }

  let startMillis = Date.parse(itineraryStartTimeInput?.value || expeditionStartTime);
  if (isNaN(startMillis)) {
    startMillis = Date.now();
  }

  let currentMillis = startMillis;
  let totalTravelSec = 0;
  let totalBreakMin = 0;
  let totalDistanceMi = 0;
  let totalBudget = 0;
  let currentDay = 1;

  itineraryTableBody.innerHTML = "";

  waypoints.forEach((wp, idx) => {
    let legTravelSec = 0;
    let legDistanceMi = 0;

    if (idx > 0) {
      const legMetric = currentLegMetrics[idx - 1];
      if (legMetric) {
        legTravelSec = legMetric.durationSec;
        legDistanceMi = legMetric.distanceMi;
      }
    }

    totalTravelSec += legTravelSec;
    totalDistanceMi += legDistanceMi;
    currentMillis += legTravelSec * 1000;

    const etaDate = new Date(currentMillis);

    // Insert Day Banner Row at start or after an overnight stay
    if (idx === 0 || (idx > 0 && waypoints[idx - 1].isOvernight)) {
      if (idx > 0) currentDay++;
      const dayHeaderTr = document.createElement("tr");
      dayHeaderTr.className = "day-header-row";
      dayHeaderTr.innerHTML = `
        <td colspan="9">
          <div class="day-header-content">
            <div class="day-header-title">
              <span>🗓️ DAY ${currentDay}</span>
              <span>—</span>
              <span>${formatDayHeaderDate(etaDate)}</span>
            </div>
            <span class="day-header-stats">EXPEDITION LEG ${idx + 1}</span>
          </div>
        </td>
      `;
      itineraryTableBody.appendChild(dayHeaderTr);
    }

    const isOvernight = Boolean(wp.isOvernight);
    const overnightDepartHour = wp.overnightDepartHour !== undefined ? wp.overnightDepartHour : 8;

    let breakMin = 0;
    let departDate: Date;

    if (isOvernight) {
      const targetDepart = new Date(etaDate);
      targetDepart.setDate(targetDepart.getDate() + 1);
      targetDepart.setHours(overnightDepartHour, 0, 0, 0);

      if (targetDepart.getTime() <= currentMillis) {
        targetDepart.setDate(targetDepart.getDate() + 1);
      }

      const departMillis = targetDepart.getTime();
      breakMin = Math.round((departMillis - currentMillis) / 60000);
      departDate = targetDepart;
      currentMillis = departMillis;
    } else {
      breakMin = wp.breakMin !== undefined ? wp.breakMin : (wp.type === "origin" ? 0 : wp.type === "destination" ? 0 : 15);
      const departMillis = currentMillis + breakMin * 60 * 1000;
      departDate = new Date(departMillis);
      currentMillis = departMillis;
    }

    totalBreakMin += breakMin;

    const budget = wp.budget !== undefined ? wp.budget : 0;
    totalBudget += budget;

    const notes = wp.notes || "";
    const titleText = wp.title || (wp.type === "origin" ? "Origin" : wp.type === "destination" ? "Destination" : `Stop #${idx}`);

    let tagLabel = `#${idx}`;
    let tagStyle = "color:#f59e0b;";
    if (wp.type === "origin") {
      tagLabel = "ORIGIN";
      tagStyle = "color:#10b981; font-weight:800;";
    } else if (wp.type === "destination") {
      tagLabel = "DEST";
      tagStyle = "color:#ef4444; font-weight:800;";
    }

    const currentCategory = getCategoryForWaypoint(wp);

    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td class="col-seq" style="${tagStyle}">[ ${tagLabel} ]</td>
      <td class="col-stop">${titleText}</td>
      <td class="col-travel">${idx === 0 ? "START" : formatDuration(legTravelSec)}</td>
      <td class="col-dist">${idx === 0 ? "0.0 MI" : `${legDistanceMi.toFixed(1)} MI`}</td>
      <td id="itin-eta-${wp.id}" class="col-eta" title="${formatDateTimeReadable(etaDate)}">${formatTimeOnly(etaDate)}</td>
      <td class="col-break">
        <div class="break-cell-wrapper">
          <select class="table-select-category" data-wp-id="${wp.id}">
            <option value="general" ${currentCategory === 'general' ? 'selected' : ''}>📍 General</option>
            <option value="gas" ${currentCategory === 'gas' ? 'selected' : ''}>⛽ Gas / Refuel</option>
            <option value="lodging" ${currentCategory === 'lodging' ? 'selected' : ''}>🏨 Lodging</option>
            <option value="restaurant" ${currentCategory === 'restaurant' ? 'selected' : ''}>🍽️ Dining</option>
            <option value="attraction" ${currentCategory === 'attraction' ? 'selected' : ''}>⛰️ Sightseeing</option>
            <option value="shopping" ${currentCategory === 'shopping' ? 'selected' : ''}>🛒 Supplies</option>
          </select>
          ${isOvernight ? `
            <select class="overnight-depart-select" data-wp-id="${wp.id}">
              <option value="6" ${overnightDepartHour === 6 ? 'selected' : ''}>Depart 6:00 AM</option>
              <option value="7" ${overnightDepartHour === 7 ? 'selected' : ''}>Depart 7:00 AM</option>
              <option value="8" ${overnightDepartHour === 8 ? 'selected' : ''}>Depart 8:00 AM</option>
              <option value="9" ${overnightDepartHour === 9 ? 'selected' : ''}>Depart 9:00 AM</option>
              <option value="10" ${overnightDepartHour === 10 ? 'selected' : ''}>Depart 10:00 AM</option>
            </select>
          ` : `
            <input 
              type="number" 
              class="table-input-break" 
              data-wp-id="${wp.id}" 
              value="${breakMin}" 
              min="0" 
              step="5" 
            />
          `}
        </div>
      </td>
      <td id="itin-depart-${wp.id}" class="col-depart" title="${formatDateTimeReadable(departDate)}">${formatTimeOnly(departDate)}</td>
      <td class="col-budget">
        <input 
          type="number" 
          class="table-input-budget" 
          data-wp-id="${wp.id}" 
          value="${budget > 0 ? budget.toFixed(2) : ""}" 
          placeholder="0.00" 
          min="0" 
          step="0.01" 
        />
      </td>
      <td class="col-notes">
        <input 
          type="text" 
          class="table-input-notes" 
          data-wp-id="${wp.id}" 
          value="${notes}" 
          placeholder="Notes, fuel, radio..." 
        />
      </td>
    `;

    itineraryTableBody.appendChild(tr);
  });

  // Update Summary Metrics Bar
  const totalNights = Math.max(0, currentDay - 1);
  if (itinSumDays) itinSumDays.textContent = `${currentDay} ${currentDay === 1 ? 'DAY' : 'DAYS'} (${totalNights} ${totalNights === 1 ? 'NIGHT' : 'NIGHTS'})`;
  if (itinSumTravel) itinSumTravel.textContent = formatDuration(totalTravelSec);
  if (itinSumBreak) itinSumBreak.textContent = formatDuration(totalBreakMin * 60);
  if (itinSumTotal) itinSumTotal.textContent = formatDuration(totalTravelSec + totalBreakMin * 60);
  if (itinSumDist) itinSumDist.textContent = `${totalDistanceMi.toFixed(1)} MI`;
  if (itinSumBudget) itinSumBudget.textContent = `$${totalBudget.toFixed(2)}`;
}

// Export Itinerary Matrix to CSV File with Multi-Day Columns
function exportItineraryCSV() {
  if (waypoints.length === 0) {
    alert("No waypoints available to export.");
    return;
  }

  let startMillis = Date.parse(itineraryStartTimeInput?.value || expeditionStartTime);
  if (isNaN(startMillis)) startMillis = Date.now();

  let currentMillis = startMillis;
  let currentDay = 1;

  const headers = [
    "Expedition Day",
    "Sequence",
    "Waypoint Type",
    "Title",
    "Latitude",
    "Longitude",
    "Travel Time",
    "Distance (Mi)",
    "ETA",
    "Rest/Overnight",
    "Break Duration (Min)",
    "Depart Time",
    "Budget ($)",
    "Notes"
  ];

  const csvRows: string[][] = [headers];

  waypoints.forEach((wp, idx) => {
    let legTravelSec = 0;
    let legDistanceMi = 0;

    if (idx > 0) {
      const legMetric = currentLegMetrics[idx - 1];
      if (legMetric) {
        legTravelSec = legMetric.durationSec;
        legDistanceMi = legMetric.distanceMi;
      }
    }

    currentMillis += legTravelSec * 1000;
    const etaDate = new Date(currentMillis);

    if (idx > 0 && waypoints[idx - 1].isOvernight) {
      currentDay++;
    }

    const isOvernight = Boolean(wp.isOvernight);
    const overnightDepartHour = wp.overnightDepartHour !== undefined ? wp.overnightDepartHour : 8;

    let breakMin = 0;
    let departDate: Date;

    if (isOvernight) {
      const targetDepart = new Date(etaDate);
      targetDepart.setDate(targetDepart.getDate() + 1);
      targetDepart.setHours(overnightDepartHour, 0, 0, 0);

      if (targetDepart.getTime() <= currentMillis) {
        targetDepart.setDate(targetDepart.getDate() + 1);
      }

      const departMillis = targetDepart.getTime();
      breakMin = Math.round((departMillis - currentMillis) / 60000);
      departDate = targetDepart;
      currentMillis = departMillis;
    } else {
      breakMin = wp.breakMin !== undefined ? wp.breakMin : (wp.type === "origin" ? 0 : wp.type === "destination" ? 0 : 15);
      const departMillis = currentMillis + breakMin * 60 * 1000;
      departDate = new Date(departMillis);
      currentMillis = departMillis;
    }

    const budget = wp.budget || 0;
    const notes = wp.notes || "";
    const titleText = wp.title || (wp.type === "origin" ? "Origin" : wp.type === "destination" ? "Destination" : `Stop #${idx}`);

    csvRows.push([
      `Day ${currentDay}`,
      (idx + 1).toString(),
      wp.type.toUpperCase(),
      `"${titleText.replace(/"/g, '""')}"`,
      wp.lat !== null ? wp.lat.toFixed(6) : "",
      wp.lon !== null ? wp.lon.toFixed(6) : "",
      idx === 0 ? "START" : formatDuration(legTravelSec),
      idx === 0 ? "0.0" : legDistanceMi.toFixed(1),
      formatDateTimeReadable(etaDate),
      isOvernight ? "OVERNIGHT STAY" : "SHORT BREAK",
      breakMin.toString(),
      formatDateTimeReadable(departDate),
      budget.toFixed(2),
      `"${notes.replace(/"/g, '""')}"`
    ]);
  });

  const csvContent = csvRows.map((row) => row.join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  const filename = `${currentTripTitle.toLowerCase().replace(/[^a-z0-9]/g, "_")}_multiday_itinerary.csv`;
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  showToast(`Exported multi-day itinerary to ${filename}`);
}

// Center and zoom map to a specific waypoint
function focusOnWaypoint(wpId: string) {
  const wp = waypoints.find((w) => w.id === wpId);
  if (!wp || wp.lat === null || wp.lon === null || !map) return;

  // Fly and zoom map to waypoint location
  map.flyTo({
    center: [wp.lon, wp.lat],
    zoom: 15,
    speed: 1.4,
    essential: true
  });

  // Toggle map popup for this marker
  const markerObj = waypointMapMarkers.find((m) => m.id === wpId);
  if (markerObj && markerObj.marker.getPopup()) {
    if (!markerObj.marker.getPopup().isOpen()) {
      markerObj.marker.togglePopup();
    }
  }
}

// Spatial algorithm to find optimal insertion index for right-click stop (supports extending destination if farther out)
function findOptimalInsertionIndex(lat: number, lon: number): number {
  const validWaypoints = waypoints.filter((w) => w.lat !== null && w.lon !== null);
  const N = validWaypoints.length;

  if (N < 2) {
    return waypoints.length;
  }

  const origin = validWaypoints[0];
  const dest = validWaypoints[N - 1];

  const distOriginToNew = haversineDistance(origin.lat!, origin.lon!, lat, lon);
  const distDestToNew = haversineDistance(dest.lat!, dest.lon!, lat, lon);
  const totalOrigToDest = haversineDistance(origin.lat!, origin.lon!, dest.lat!, dest.lon!);

  // Check if new point is logically farther than the current last stop (destination)
  // If dist(Origin -> New) > dist(Origin -> CurrentDest) AND dist(CurrentDest -> New) < dist(Origin -> New)
  if (distOriginToNew > totalOrigToDest && distDestToNew < distOriginToNew) {
    return waypoints.length; // Append at end to become the new Destination!
  }

  // Otherwise evaluate intermediate insertion detour vs appending at end
  let bestIndex = waypoints.length;
  let minDetour = distDestToNew; // Detour for appending at the end

  for (let i = 0; i < N - 1; i++) {
    const w1 = validWaypoints[i];
    const w2 = validWaypoints[i + 1];

    const d1 = haversineDistance(w1.lat!, w1.lon!, lat, lon);
    const d2 = haversineDistance(lat, lon, w2.lat!, w2.lon!);
    const originalDist = haversineDistance(w1.lat!, w1.lon!, w2.lat!, w2.lon!);

    const detour = (d1 + d2) - originalDist;
    if (detour < minDetour) {
      minDetour = detour;
      const realIndex = waypoints.findIndex((w) => w.id === w2.id);
      if (realIndex !== -1) {
        bestIndex = realIndex;
      }
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
    lastRouteCoordinates = coordinates;

    // Update main bottom metrics
    if (metricDistance) metricDistance.textContent = `${distanceMi.toFixed(1)} MI`;
    if (metricDuration) metricDuration.textContent = formatDuration(durationSec);

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
          "line-color": "#38bdf8",
          "line-width": 5,
          "line-opacity": 0.9
        }
      });
    }

    // Update Leg Badges UI & Fuel Range Calculations (after route source added)
    updateFuelCalculations();
  } catch (err) {
    console.error("Expedition Route calculation error:", err);
  }
}

// Calculate Fuel Exhaustion Visuals (Point + Empty Route Line String)
function calculateFuelExhaustionVisuals(
  coordinates: [number, number][],
  waypointsList: Waypoint[],
  maxRangeMi: number
): { exhaustionPoint: [number, number] | null; emptyLineCoords: [number, number][] } {
  if (coordinates.length < 2 || maxRangeMi <= 0) {
    return { exhaustionPoint: null, emptyLineCoords: [] };
  }

  let accumulatedDistOnTank = 0;
  let exhaustionPoint: [number, number] | null = null;
  let emptyLineCoords: [number, number][] = [];
  let isExhausted = false;

  const gasStopIndices: number[] = [];
  waypointsList.forEach((wp, wIdx) => {
    if (wIdx > 0 && getCategoryForWaypoint(wp) === "gas" && wp.lat !== null && wp.lon !== null) {
      let minDist = Infinity;
      let closestIdx = 0;
      coordinates.forEach((coord, cIdx) => {
        const d = haversineDistance(wp.lat!, wp.lon!, coord[1], coord[0]);
        if (d < minDist) {
          minDist = d;
          closestIdx = cIdx;
        }
      });
      gasStopIndices.push(closestIdx);
    }
  });

  for (let i = 0; i < coordinates.length - 1; i++) {
    if (gasStopIndices.includes(i)) {
      accumulatedDistOnTank = 0;
      isExhausted = false;
    }

    const p1 = coordinates[i];
    const p2 = coordinates[i + 1];
    const stepDist = haversineDistance(p1[1], p1[0], p2[1], p2[0]);

    if (!isExhausted) {
      if (accumulatedDistOnTank + stepDist >= maxRangeMi) {
        const remainingToExhaustion = maxRangeMi - accumulatedDistOnTank;
        const frac = stepDist > 0 ? remainingToExhaustion / stepDist : 0;
        const interpLon = p1[0] + (p2[0] - p1[0]) * frac;
        const interpLat = p1[1] + (p2[1] - p1[1]) * frac;

        exhaustionPoint = [interpLon, interpLat];
        isExhausted = true;
        emptyLineCoords.push(exhaustionPoint);
        emptyLineCoords.push(p2);
      } else {
        accumulatedDistOnTank += stepDist;
      }
    } else {
      emptyLineCoords.push(p2);
    }
  }

  return { exhaustionPoint, emptyLineCoords };
}

let fuelExhaustionMarkerInstance: maplibregl.Marker | null = null;

function updateFuelExhaustionMapOverlay(coordinates: [number, number][]) {
  if (!map) return;

  if (!vehicleProfile.enabled || coordinates.length < 2) {
    if (fuelExhaustionMarkerInstance) {
      fuelExhaustionMarkerInstance.remove();
      fuelExhaustionMarkerInstance = null;
    }
    if (map.getSource("expedition-empty-route-src")) {
      (map.getSource("expedition-empty-route-src") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: []
      });
    }
    return;
  }

  const maxRange = getVehicleMaxRange();
  const { exhaustionPoint, emptyLineCoords } = calculateFuelExhaustionVisuals(coordinates, waypoints, maxRange);

  if (exhaustionPoint) {
    if (!fuelExhaustionMarkerInstance) {
      const el = document.createElement("div");
      el.className = "fuel-exhaustion-marker";
      el.innerHTML = "⚠️";

      const popup = new maplibregl.Popup({ offset: 15 }).setHTML(`
        <div style="font-family:var(--font-mono); font-size:0.75rem; font-weight:800; color:#ef4444;">
          ⚠️ FUEL EXHAUSTION POINT
        </div>
        <div style="font-family:var(--font-mono); font-size:0.7rem; color:#f8fafc; margin-top:4px;">
          0 Gallons Remaining on Tank<br/>
          Refuel required before this location!
        </div>
      `);

      fuelExhaustionMarkerInstance = new maplibregl.Marker({ element: el })
        .setLngLat([exhaustionPoint[0], exhaustionPoint[1]])
        .setPopup(popup)
        .addTo(map);
    } else {
      fuelExhaustionMarkerInstance.setLngLat([exhaustionPoint[0], exhaustionPoint[1]]);
    }
  } else {
    if (fuelExhaustionMarkerInstance) {
      fuelExhaustionMarkerInstance.remove();
      fuelExhaustionMarkerInstance = null;
    }
  }

  const emptyGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: emptyLineCoords.length > 1 ? [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: emptyLineCoords
        }
      }
    ] : []
  };

  if (map.getSource("expedition-empty-route-src")) {
    (map.getSource("expedition-empty-route-src") as maplibregl.GeoJSONSource).setData(emptyGeoJSON);
  } else {
    map.addSource("expedition-empty-route-src", {
      type: "geojson",
      data: emptyGeoJSON
    });

    map.addLayer({
      id: "expedition-empty-route-layer",
      type: "line",
      source: "expedition-empty-route-src",
      layout: {
        "line-join": "round",
        "line-cap": "round"
      },
      paint: {
        "line-color": "#ef4444",
        "line-width": 6,
        "line-dasharray": [2, 2],
        "line-opacity": 0.95
      }
    });
  }
}

// Calculate Effective Max Cruising Range (Miles)
function getVehicleMaxRange(): number {
  const effectiveTank = Math.max(0, vehicleProfile.tankCapacityGal - vehicleProfile.reserveGal);
  return effectiveTank * vehicleProfile.mpg;
}

// Live calculation of fuel consumption, estimated cost, and max range
function updateFuelCalculations() {
  const mpg = parseFloat(fuelMpgInput?.value || "18") || 18;
  const tank = parseFloat(tankCapacityInput?.value || "20") || 20;
  const price = parseFloat(fuelPriceInput?.value || "3.65") || 3.65;
  const reserve = parseFloat(reserveGalInput?.value || "2") || 2;
  const enabled = fuelTrackingToggle ? fuelTrackingToggle.checked : true;

  vehicleProfile = { mpg, tankCapacityGal: tank, fuelPricePerGal: price, reserveGal: reserve, enabled };

  const maxRange = getVehicleMaxRange();
  if (fuelMaxRange) fuelMaxRange.textContent = enabled ? `${maxRange.toFixed(1)} MI` : "OFF";

  let totalDistMi = 0;
  currentLegMetrics.forEach((leg) => {
    totalDistMi += leg.distanceMi;
  });

  const totalFuelGal = mpg > 0 ? totalDistMi / mpg : 0;
  const totalFuelCost = totalFuelGal * price;

  if (fuelReqGal) fuelReqGal.textContent = enabled ? `${totalFuelGal.toFixed(1)} GAL` : "OFF";
  if (fuelEstCost) fuelEstCost.textContent = enabled ? `$${totalFuelCost.toFixed(2)}` : "OFF";
  if (itinSumFuel) itinSumFuel.textContent = enabled ? `${totalFuelGal.toFixed(1)} GAL ($${totalFuelCost.toFixed(2)})` : "OFF";

  updateLegBadgesUI();
  if (lastRouteCoordinates.length > 0) {
    updateFuelExhaustionMapOverlay(lastRouteCoordinates);
  }
}

// Update Waypoint Card Line 2 Arrival & Departure Badges
function updateWaypointCardTiming() {
  let currentMillis = Date.parse(expeditionStartTime);
  if (isNaN(currentMillis)) currentMillis = Date.now();

  waypoints.forEach((wp, idx) => {
    const arrEl = document.getElementById(`wp-arr-${wp.id}`);
    const depEl = document.getElementById(`wp-dep-${wp.id}`);

    if (idx === 0) {
      const depDate = new Date(currentMillis);
      if (arrEl) arrEl.textContent = "🚀 START";
      if (depEl) depEl.textContent = formatTimeOnly(depDate);
      return;
    }

    const legIndex = idx - 1;
    const legMetric = currentLegMetrics[legIndex];
    const travelSec = legMetric ? legMetric.durationSec : 0;
    currentMillis += travelSec * 1000;
    const etaDate = new Date(currentMillis);

    let breakMin = 15;
    if (wp.isOvernight) {
      const targetDepart = new Date(etaDate);
      targetDepart.setDate(targetDepart.getDate() + 1);
      targetDepart.setHours(wp.overnightDepartHour || 8, 0, 0, 0);
      currentMillis = targetDepart.getTime();
    } else {
      breakMin = wp.breakMin !== undefined ? wp.breakMin : 15;
      currentMillis += breakMin * 60 * 1000;
    }

    const depDate = new Date(currentMillis);

    if (idx === waypoints.length - 1) {
      if (arrEl) arrEl.textContent = formatTimeOnly(etaDate);
      if (depEl) depEl.textContent = "🏁 FINISH";
    } else {
      if (arrEl) arrEl.textContent = formatTimeOnly(etaDate);
      if (depEl) depEl.textContent = formatTimeOnly(depDate);
    }
  });
}

// Update inter-waypoint leg distance, time, and RANGE WARNING badges UI
function updateLegBadgesUI() {
  const maxRange = getVehicleMaxRange();
  const isEnabled = vehicleProfile.enabled !== false;

  let accumulatedTankDistance = 0;

  currentLegMetrics.forEach((leg, idx) => {
    accumulatedTankDistance += leg.distanceMi;

    const badgeEl = document.getElementById(`leg-badge-${idx}`);
    if (badgeEl) {
      if (isEnabled && accumulatedTankDistance > maxRange) {
        badgeEl.className = "leg-badge leg-range-warning";
        badgeEl.textContent = `⚠️ RANGE WARNING: ${accumulatedTankDistance.toFixed(1)} MI ON TANK > ${maxRange.toFixed(1)} MI MAX RANGE`;
      } else {
        badgeEl.className = "leg-badge";
        badgeEl.textContent = `↓ ${leg.distanceMi.toFixed(1)} MI • ${formatDuration(leg.durationSec)}`;
      }
    }

    // Check if the destination waypoint of this leg (idx + 1) is a GAS stop
    const nextWp = waypoints[idx + 1];
    if (nextWp) {
      const nextCategory = getCategoryForWaypoint(nextWp);
      if (nextCategory === "gas") {
        // Refuel stop reached! Reset distance accumulated on current tank
        accumulatedTankDistance = 0;
      }
    }
  });

  updateWaypointCardTiming();

  if (itineraryModal && itineraryModal.style.display === "flex") {
    renderItinerarySpreadsheet();
  }
}

function createMarkerPopupHtml(wp: Waypoint, idx: number, markerColor: string, iconLabel: string): string {
  const placeholderText = wp.type === "origin" ? "Origin Title" : wp.type === "destination" ? "Destination Title" : `Stop #${idx} Title`;
  const currentCategory = getCategoryForWaypoint(wp);

  return `
    <div class="map-popup-card">
      <div class="map-popup-header" style="color:${markerColor}">[ ${iconLabel} ]</div>
      <input 
        type="text" 
        class="map-popup-title-input" 
        data-wp-id="${wp.id}" 
        value="${wp.title || ""}" 
        placeholder="${placeholderText}" 
      />
      <div class="map-popup-coords">${wp.lat!.toFixed(6)}, ${wp.lon!.toFixed(6)}</div>

      <div class="map-popup-category-row">
        <label class="map-popup-label">STOP TYPE</label>
        <select class="map-popup-category-select" data-wp-id="${wp.id}">
          <option value="general" ${currentCategory === 'general' ? 'selected' : ''}>📍 General Stop</option>
          <option value="gas" ${currentCategory === 'gas' ? 'selected' : ''}>⛽ Gas / Refuel</option>
          <option value="lodging" ${currentCategory === 'lodging' ? 'selected' : ''}>🏨 Lodging (Overnight)</option>
          <option value="restaurant" ${currentCategory === 'restaurant' ? 'selected' : ''}>🍽️ Restaurant / Food</option>
          <option value="attraction" ${currentCategory === 'attraction' ? 'selected' : ''}>⛰️ Sightseeing</option>
          <option value="shopping" ${currentCategory === 'shopping' ? 'selected' : ''}>🛒 Supplies</option>
        </select>
      </div>
    </div>
  `;
}

// Sync Map Markers with Active Waypoints List (DRAGGABLE = TRUE)
function renderWaypointMapMarkers() {
  if (!map) return;

  // Clear existing waypoint markers
  waypointMapMarkers.forEach((item) => item.marker.remove());
  waypointMapMarkers = [];

  waypoints.forEach((wp, idx) => {
    if (wp.lat === null || wp.lon === null) return;

    const currentCat = getCategoryForWaypoint(wp);
    const catDetails = CATEGORY_DETAILS[currentCat];

    let markerColor = catDetails ? catDetails.color : "#38bdf8";
    let iconLabel = `STOP #${idx} • ${catDetails ? catDetails.icon : "📍"}`;

    if (wp.type === "origin") {
      markerColor = "#10b981";
      iconLabel = "EXPEDITION ORIGIN";
    } else if (wp.type === "destination") {
      markerColor = "#ef4444";
      iconLabel = "FINAL DESTINATION";
    }

    const popupHtml = createMarkerPopupHtml(wp, idx, markerColor, iconLabel);
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
      marker.getPopup()?.setHTML(createMarkerPopupHtml(wp, idx, markerColor, iconLabel));

      // Update Left Panel input fields
      const coordsInput = document.querySelector(`.waypoint-coords-input[data-id="${wp.id}"]`) as HTMLInputElement;
      if (coordsInput) {
        coordsInput.value = `${wp.lat.toFixed(6)}, ${wp.lon.toFixed(6)}`;
      }

      // Re-trigger live route recalculation!
      updateExpeditionRoute();
    });

    waypointMapMarkers.push({ id: wp.id, marker });
  });
}

// Global Category Dropdown Change Listener (Popup, Table, Waypoint Card)
document.addEventListener("change", (e) => {
  const target = e.target as HTMLSelectElement;
  if (!target) return;

  if (
    target.classList.contains("map-popup-category-select") ||
    target.classList.contains("table-select-category") ||
    target.classList.contains("waypoint-category-select")
  ) {
    const wpId = target.dataset.wpId;
    if (!wpId) return;

    const newCategory = target.value as StopCategory;
    const wp = waypoints.find((w) => w.id === wpId);
    if (wp) {
      setWaypointCategory(wp, newCategory);
      renderWaypointsUI();
      renderWaypointMapMarkers();
      updateFuelCalculations();
      updateLegBadgesUI();

      const catDetails = CATEGORY_DETAILS[newCategory];
      showToast(`Updated ${wp.title || 'Stop'} to ${catDetails.label} ${catDetails.icon}`);
    }
  }
});

document.addEventListener("input", (e) => {
  const target = e.target as HTMLInputElement;
  if (target && target.classList.contains("map-popup-title-input") && target.dataset.wpId) {
    const wpId = target.dataset.wpId;
    const wp = waypoints.find((w) => w.id === wpId);
    if (wp) {
      wp.title = target.value;
      // Sync title input in left panel list
      const listTitleInput = document.querySelector(`.waypoint-name-input[data-id="${wpId}"]`) as HTMLInputElement;
      if (listTitleInput) listTitleInput.value = target.value;
    }
  }
});

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
        : `↓ ENTER WAYPOINTS...`;

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
    itemEl.setAttribute("data-wp-id", wp.id);

    let tagClass = "tag-stop";
    let titlePlaceholder = `Stop #${idx + 1} Title`;



    if (wp.type === "origin") {
      tagClass = "tag-origin";
      titlePlaceholder = "Origin Location Title";
    } else if (wp.type === "destination") {
      tagClass = "tag-dest";
      titlePlaceholder = "Destination Location Title";
    }

    const coordsString = (wp.lat !== null && wp.lon !== null) 
      ? `${wp.lat.toFixed(4)}, ${wp.lon.toFixed(4)}` 
      : "";

    itemEl.innerHTML = `
      <!-- Whole Left Drag Gutter with Stop # Number -->
      <div class="wp-card-gutter drag-handle ${tagClass}" title="Drag to reorder waypoint sequence">
        <span class="wp-gutter-grip">⋮</span>
        <span class="wp-gutter-num">#${idx + 1}</span>
        <span class="wp-gutter-grip">⋮</span>
      </div>

      <!-- Main Card Content Body -->
      <div class="wp-card-body">
        <!-- Line 1: Full Width Destination Title + Delete Button -->
        <div class="wp-card-line1">
          <input 
            type="text" 
            class="waypoint-name-input" 
            data-id="${wp.id}" 
            data-field="title"
            value="${wp.title}" 
            placeholder="${titlePlaceholder}" 
          />
          ${waypoints.length > 2 ? `<button class="btn-remove-waypoint" data-id="${wp.id}" title="Remove Stop">✕</button>` : ""}
        </div>

        <!-- Line 2: [ Arrival | Lng,Lat | Depart ] -->
        <div class="wp-card-line2">
          <span class="wp-meta-arr" id="wp-arr-${wp.id}">ARR: --:--</span>
          <span class="wp-meta-sep">|</span>
          <input 
            type="text" 
            class="waypoint-coords-input" 
            data-id="${wp.id}" 
            data-field="coords"
            value="${coordsString}" 
            placeholder="Lat, Lon" 
            title="Latitude, Longitude coordinates"
          />
          <span class="wp-meta-sep">|</span>
          <span class="wp-meta-dep" id="wp-dep-${wp.id}">DEP: --:--</span>
        </div>
      </div>
    `;

    // Click on Waypoint Card -> Center & Zoom Map to it!
    itemEl.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      // Do not trigger zoom if clicking remove button or inline add button
      if (target.classList.contains("btn-remove-waypoint") || target.classList.contains("btn-add-inline-leg")) {
        return;
      }
      focusOnWaypoint(wp.id);
    });

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

        // Re-render UI, map markers, and redraw route
        renderWaypointsUI();
        renderWaypointMapMarkers();
        updateExpeditionRoute();
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
  updateWaypointCardTiming();
}

// Helper to insert a new stop at a specific index
function insertNewStopAt(insertIndex: number, lat?: number, lon?: number) {
  let targetLat: number | null = lat !== undefined ? lat : null;
  let targetLon: number | null = lon !== undefined ? lon : null;

  const newStop: Waypoint = {
    id: `wp-stop-${Date.now()}`,
    title: "",
    lat: targetLat,
    lon: targetLon,
    type: "stop"
  };

  waypoints.splice(insertIndex, 0, newStop);
  renderWaypointsUI();
  renderWaypointMapMarkers();
  updateExpeditionRoute();

  if (targetLat !== null && targetLon !== null) {
    focusOnWaypoint(newStop.id);
  }
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
      renderWaypointMapMarkers();
      updateExpeditionRoute();
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
          focusOnWaypoint(wp.id);
          renderWaypointMapMarkers();
          updateExpeditionRoute();
        } else {
          wp.lat = null;
          wp.lon = null;
          renderWaypointMapMarkers();
          updateExpeditionRoute();
        }
      } else {
        wp.lat = null;
        wp.lon = null;
        renderWaypointMapMarkers();
        updateExpeditionRoute();
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

if (modalTripSummary) {
  modalTripSummary.addEventListener("input", () => {
    currentTripSummary = modalTripSummary.value;
  });
}

// Vehicle Profile Modal Controls
function openVehicleModal() {
  if (!vehicleModal) return;
  updateFuelCalculations();
  vehicleModal.style.display = "flex";
}

function closeVehicleModal() {
  if (vehicleModal) vehicleModal.style.display = "none";
}

if (navVehicleBtn) navVehicleBtn.addEventListener("click", openVehicleModal);
if (openVehicleBtn) openVehicleBtn.addEventListener("click", openVehicleModal);
if (vehicleModalClose) vehicleModalClose.addEventListener("click", closeVehicleModal);

if (fuelMpgInput) fuelMpgInput.addEventListener("input", updateFuelCalculations);
if (tankCapacityInput) tankCapacityInput.addEventListener("input", updateFuelCalculations);
if (fuelPriceInput) fuelPriceInput.addEventListener("input", updateFuelCalculations);
if (reserveGalInput) reserveGalInput.addEventListener("input", updateFuelCalculations);
if (fuelTrackingToggle) fuelTrackingToggle.addEventListener("change", updateFuelCalculations);

// Itinerary Modal Controls
function openItineraryModal() {
  if (!itineraryModal) return;
  renderItinerarySpreadsheet();
  itineraryModal.style.display = "flex";
}

function closeItineraryModal() {
  if (itineraryModal) itineraryModal.style.display = "none";
}

if (openItineraryBtn) openItineraryBtn.addEventListener("click", openItineraryModal);
if (itineraryModalClose) itineraryModalClose.addEventListener("click", closeItineraryModal);

// Render Clean Monochrome Print Manifest Document (Dynamic Multi-Page Chunking & Alternating Shaded Rows)
function renderPrintManifest() {
  const container = document.getElementById("print-manifest-container");
  if (!container) return;

  const now = new Date();
  const docId = `IV-${now.getFullYear()}-${Math.floor(Math.random() * 899 + 100)}`;
  const issuedDate = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase();

  let startMillis = Date.parse(expeditionStartTime);
  if (isNaN(startMillis)) startMillis = Date.now();
  const startDate = new Date(startMillis);
  const departDateStr = `${startDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })} @ ${formatTimeOnly(startDate)}`;

  let totalDistMi = 0;
  let totalDurationSec = 0;
  currentLegMetrics.forEach((leg) => {
    totalDistMi += leg.distanceMi;
    totalDurationSec += leg.durationSec;
  });
  const totalStatsStr = `${totalDistMi.toFixed(1)} MI • ${formatDuration(totalDurationSec)}`;

  const maxRange = getVehicleMaxRange();
  const enabled = vehicleProfile.enabled !== false;
  const totalFuelGal = vehicleProfile.mpg > 0 ? totalDistMi / vehicleProfile.mpg : 0;
  const totalFuelCost = totalFuelGal * vehicleProfile.fuelPricePerGal;

  const fuelMpgStr = enabled ? `${vehicleProfile.mpg.toFixed(1)} MPG` : "OFF";
  const fuelRangeStr = enabled ? `${maxRange.toFixed(1)} MI` : "OFF";
  const fuelReqStr = enabled ? `${totalFuelGal.toFixed(1)} GAL` : "OFF";
  const fuelCostStr = enabled ? `$${totalFuelCost.toFixed(2)}` : "OFF";

  // Pre-calculate Waypoints Times & Distances
  let currentMillis = startMillis;
  const processedWaypoints: any[] = [];

  waypoints.forEach((wp, idx) => {
    const category = getCategoryForWaypoint(wp);
    const catDetail = CATEGORY_DETAILS[category];
    const categoryText = catDetail ? catDetail.label.toUpperCase() : "GENERAL";

    let arrTime = "START";
    let depTime = "--:--";

    if (idx > 0) {
      const legIndex = idx - 1;
      const legMetric = currentLegMetrics[legIndex];
      const travelSec = legMetric ? legMetric.durationSec : 0;
      currentMillis += travelSec * 1000;
      const etaDate = new Date(currentMillis);
      arrTime = formatTimeOnly(etaDate);

      if (wp.isOvernight) {
        const targetDepart = new Date(etaDate);
        targetDepart.setDate(targetDepart.getDate() + 1);
        targetDepart.setHours(wp.overnightDepartHour || 8, 0, 0, 0);
        currentMillis = targetDepart.getTime();
      } else {
        const breakMin = wp.breakMin !== undefined ? wp.breakMin : 15;
        currentMillis += breakMin * 60 * 1000;
      }
    }

    const depDate = new Date(currentMillis);
    if (idx === 0) {
      depTime = formatTimeOnly(depDate);
    } else if (idx === waypoints.length - 1) {
      depTime = "FINISH";
    } else {
      depTime = formatTimeOnly(depDate);
    }

    const legDist = idx > 0 && currentLegMetrics[idx - 1] 
      ? `${currentLegMetrics[idx - 1].distanceMi.toFixed(1)} MI` 
      : "--";

    const coordsStr = (wp.lat !== null && wp.lon !== null) 
      ? `${wp.lat.toFixed(4)}, ${wp.lon.toFixed(4)}` 
      : "--";

    processedWaypoints.push({
      idx: idx + 1,
      title: wp.title || (idx === 0 ? "Origin Point" : idx === waypoints.length - 1 ? "Destination Point" : `Stop #${idx + 1}`),
      categoryText,
      arrTime,
      depTime,
      legDist,
      coordsStr,
      notes: wp.notes && wp.notes.trim() ? wp.notes.trim() : "None",
      budget: (wp as any).budget ? parseFloat((wp as any).budget) : (wp.isOvernight ? 120 : 0),
      isOvernight: wp.isOvernight
    });
  });

  const finalArrivalDate = new Date(currentMillis);
  const arriveDateStr = `${finalArrivalDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })} @ ${formatTimeOnly(finalArrivalDate)}`;

  // Chunk waypoints (12 waypoints max per print page card)
  const WAYPOINTS_PER_PAGE = 12;
  const waypointChunks: any[][] = [];
  for (let i = 0; i < processedWaypoints.length; i += WAYPOINTS_PER_PAGE) {
    waypointChunks.push(processedWaypoints.slice(i, i + WAYPOINTS_PER_PAGE));
  }
  if (waypointChunks.length === 0) waypointChunks.push([]);

  const totalPages = 1 + waypointChunks.length + 1; // Page 1: Overview, Page 2...N-1: Waypoints, Page N: Check Register

  let html = "";

  // ==================== PAGE 1: OVERVIEW, LOGISTICS & FIELD NOTES ====================
  html += `
    <div class="print-form-card print-page-1">
      <div class="print-form-header">
        <div class="print-form-brand-row">
          <div class="print-form-logo-group">
            <span class="print-logo-text">ITER VIAE</span>
            <span class="print-logo-sub">TACTICAL ROUTE COMMAND • EXPEDITION MANIFEST</span>
          </div>
          <div class="print-form-meta-box">
            <div><strong>DOC ID:</strong> ${docId}</div>
            <div><strong>ISSUED:</strong> ${issuedDate}</div>
            <div><strong>CLASSIFICATION:</strong> OFFICIAL EXPEDITION</div>
          </div>
        </div>
        <div class="print-form-divider"></div>
      </div>

      <div class="print-form-section">
        <div class="print-form-section-head">SECTION 1 — EXPEDITION OVERVIEW</div>
        <div class="print-form-grid-2">
          <div class="print-form-field">
            <span class="print-field-label">EXPEDITION ROUTE TITLE</span>
            <span class="print-field-value">${currentTripTitle}</span>
          </div>
          <div class="print-form-field">
            <span class="print-field-label">TOTAL DISTANCE & TRAVEL DURATION</span>
            <span class="print-field-value">${totalStatsStr}</span>
          </div>
          <div class="print-form-field">
            <span class="print-field-label">DEPARTURE DATE & TIME</span>
            <span class="print-field-value">${departDateStr}</span>
          </div>
          <div class="print-form-field">
            <span class="print-field-label">FINAL ARRIVAL DATE & TIME</span>
            <span class="print-field-value">${arriveDateStr}</span>
          </div>
          <div class="print-form-field" style="grid-column: span 2;">
            <span class="print-field-label">EXPEDITION SUMMARY & BRIEFING</span>
            <span class="print-field-value" style="font-weight: 500; font-size: 0.8rem; white-space: pre-wrap;">${currentTripSummary || "No special briefing notes specified."}</span>
          </div>
        </div>
      </div>

      <div class="print-form-section">
        <div class="print-form-section-head">SECTION 2 — VEHICLE SPECIFICATIONS & FUEL LOGISTICS</div>
        <div class="print-form-grid-4">
          <div class="print-form-field">
            <span class="print-field-label">FUEL EFFICIENCY</span>
            <span class="print-field-value">${fuelMpgStr}</span>
          </div>
          <div class="print-form-field">
            <span class="print-field-label">CRUISING RANGE</span>
            <span class="print-field-value">${fuelRangeStr}</span>
          </div>
          <div class="print-form-field">
            <span class="print-field-label">REQUIRED FUEL</span>
            <span class="print-field-value">${fuelReqStr}</span>
          </div>
          <div class="print-form-field">
            <span class="print-field-label">ESTIMATED FUEL COST</span>
            <span class="print-field-value">${fuelCostStr}</span>
          </div>
        </div>
      </div>

      <div class="print-form-section">
        <div class="print-form-section-head">SECTION 4 — FIELD NOTES & REMARKS</div>
        <div class="print-notes-box">
          <div class="print-field-label">FIELD LOG / RADIO FREQUENCIES / CHECKPOINT REMARKS:</div>
          <div class="print-blank-lines">
            <div class="print-line"></div>
            <div class="print-line"></div>
            <div class="print-line"></div>
            <div class="print-line"></div>
            <div class="print-line"></div>
          </div>
        </div>
      </div>

      <div class="print-form-footer">
        <span>OFFICIAL EXPEDITION FORM • GENERATED BY ITER VIAE TACTICAL ROUTE COMMAND</span>
        <span>PAGE 1 OF ${totalPages}</span>
      </div>
    </div>
  `;

  // ==================== PAGES 2..N-1: WAYPOINT TIMELINE LOG (PAGINATED CHUNKS) ====================
  waypointChunks.forEach((chunk, chunkIdx) => {
    const pageNum = 2 + chunkIdx;
    html += `
      <div class="print-page-break"></div>
      <div class="print-form-card print-page-2">
        <div class="print-form-header">
          <div class="print-form-brand-row">
            <div class="print-form-logo-group">
              <span class="print-logo-text">ITER VIAE</span>
              <span class="print-logo-sub">WAYPOINT TIMELINE LOG • PART ${chunkIdx + 1} OF ${waypointChunks.length}</span>
            </div>
            <div class="print-form-meta-box">
              <div><strong>DOC ID:</strong> ${docId}</div>
              <div><strong>ISSUED:</strong> ${issuedDate}</div>
              <div><strong>CLASSIFICATION:</strong> OFFICIAL EXPEDITION</div>
            </div>
          </div>
          <div class="print-form-divider"></div>
        </div>

        <div class="print-form-section" style="flex-grow: 1;">
          <div class="print-form-section-head">SECTION 3 — ROUTE WAYPOINTS & TIMELINE LOG (${chunkIdx * WAYPOINTS_PER_PAGE + 1} TO ${Math.min((chunkIdx + 1) * WAYPOINTS_PER_PAGE, processedWaypoints.length)})</div>
          <table class="print-form-table">
            <thead>
              <tr>
                <th style="width: 5%;">SEQ</th>
                <th style="width: 32%;">WAYPOINT LOCATION</th>
                <th style="width: 18%;">CATEGORY</th>
                <th style="width: 12%;">ARRIVE</th>
                <th style="width: 12%;">DEPART</th>
                <th style="width: 9%;">LEG MI</th>
                <th style="width: 12%;">COORDINATES</th>
              </tr>
            </thead>
            <tbody>
    `;

    chunk.forEach((wp, wIdx) => {
      const isEven = wIdx % 2 === 0;
      const rowBg = isEven ? "#ffffff" : "#f1f5f9";
      const subBg = isEven ? "#f8fafc" : "#e2e8f0";
      const notesColor = wp.notes !== "None" ? "#0f172a" : "#64748b";

      html += `
        <tr style="background:${rowBg};">
          <td style="font-family:var(--font-mono); font-weight:800; text-align:center;">#${wp.idx}</td>
          <td style="font-weight:700;">${wp.title}</td>
          <td style="font-family:var(--font-mono); font-size:0.7rem; font-weight:700;">${wp.categoryText}</td>
          <td style="font-family:var(--font-mono); font-weight:700;">${wp.arrTime}</td>
          <td style="font-family:var(--font-mono); font-weight:700;">${wp.depTime}</td>
          <td style="font-family:var(--font-mono);">${wp.legDist}</td>
          <td style="font-family:var(--font-mono); font-size:0.72rem;">${wp.coordsStr}</td>
        </tr>
        <tr class="print-notes-subrow">
          <td colspan="7" style="background:${subBg}; padding: 4px 10px 5px 12px; border-top: none; border-bottom: 1px solid #cbd5e1;">
            <span style="font-family:var(--font-mono); font-size:0.62rem; font-weight:800; color:#475569; letter-spacing:0.05em; margin-right:8px;">REMARKS / CONFIRMATION:</span>
            <span style="font-size:0.75rem; font-weight:600; color:${notesColor}; white-space:pre-wrap;">${wp.notes}</span>
          </td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>

        <div class="print-form-footer">
          <span>OFFICIAL EXPEDITION FORM • GENERATED BY ITER VIAE TACTICAL ROUTE COMMAND</span>
          <span>PAGE ${pageNum} OF ${totalPages}</span>
        </div>
      </div>
    `;
  });

  // ==================== FINAL PAGE: FINANCIAL CHECK REGISTER LEDGER ====================
  let runningEstTotal = 0;
  let checkRegisterRowsHtml = "";
  let bRowIndex = 0;

  // Waypoints with custom budgets or lodging
  processedWaypoints.forEach((wp) => {
    if (wp.budget > 0) {
      runningEstTotal += wp.budget;
      const isEven = bRowIndex % 2 === 0;
      const rowBg = isEven ? "#ffffff" : "#f1f5f9";
      bRowIndex++;

      checkRegisterRowsHtml += `
        <tr style="background:${rowBg};">
          <td style="font-family:var(--font-mono); font-size:0.7rem; font-weight:700;">LEG #${wp.idx}</td>
          <td style="font-weight:700;">${wp.title} ${wp.isOvernight ? "(Overnight Stay)" : ""}</td>
          <td style="font-family:var(--font-mono); font-size:0.68rem; font-weight:700;">${wp.categoryText}</td>
          <td style="font-family:var(--font-mono); font-weight:700;">$${wp.budget.toFixed(2)}</td>
          <td style="font-family:var(--font-mono); color:#94a3b8;">$_______</td>
          <td style="font-family:var(--font-mono); color:#94a3b8;">$_______</td>
        </tr>
      `;
    }
  });

  // Add 4 Blank Checkbook Register Rows for handwritten field entries
  for (let b = 1; b <= 4; b++) {
    const isEven = bRowIndex % 2 === 0;
    const rowBg = isEven ? "#ffffff" : "#f1f5f9";
    bRowIndex++;

    checkRegisterRowsHtml += `
      <tr style="background:${rowBg};">
        <td style="font-family:var(--font-mono); color:#94a3b8;">#____</td>
        <td style="color:#cbd5e1;">_______________________________</td>
        <td style="font-family:var(--font-mono); color:#cbd5e1;">_____________</td>
        <td style="font-family:var(--font-mono); color:#94a3b8;">$_______</td>
        <td style="font-family:var(--font-mono); color:#94a3b8;">$_______</td>
        <td style="font-family:var(--font-mono); color:#94a3b8;">$_______</td>
      </tr>
    `;
  }

  html += `
    <div class="print-page-break"></div>
    <div class="print-form-card print-page-2">
      <div class="print-form-header">
        <div class="print-form-brand-row">
          <div class="print-form-logo-group">
            <span class="print-logo-text">ITER VIAE</span>
            <span class="print-logo-sub">EXPEDITION FINANCIAL LEDGER & CHECK REGISTER</span>
          </div>
          <div class="print-form-meta-box">
            <div><strong>DOC ID:</strong> ${docId}</div>
            <div><strong>ISSUED:</strong> ${issuedDate}</div>
            <div><strong>CLASSIFICATION:</strong> OFFICIAL EXPEDITION</div>
          </div>
        </div>
        <div class="print-form-divider"></div>
      </div>

      <div class="print-form-section" style="flex-grow: 1;">
        <div class="print-form-section-head">SECTION 5 — EXPEDITION FINANCIAL LEDGER & CHECK REGISTER</div>
        <table class="print-form-table print-budget-table">
          <thead>
            <tr>
              <th style="width: 10%;">DATE / LEG</th>
              <th style="width: 38%;">DESCRIPTION / EXPENSE ITEM</th>
              <th style="width: 18%;">CATEGORY</th>
              <th style="width: 12%;">ESTIMATED ($)</th>
              <th style="width: 11%;">ACTUAL SPENT ($)</th>
              <th style="width: 11%;">VARIANCE (+/-)</th>
            </tr>
          </thead>
          <tbody>
            ${checkRegisterRowsHtml}
          </tbody>
          <tfoot>
            <tr class="print-budget-totals-row">
              <td colspan="3" style="text-align: right; font-weight: 800; font-family: var(--font-mono);">TOTAL FINANCIAL BUDGET:</td>
              <td style="font-weight: 800; font-family: var(--font-mono);">$${runningEstTotal.toFixed(2)}</td>
              <td style="font-weight: 800; font-family: var(--font-mono);">$_______</td>
              <td style="font-weight: 800; font-family: var(--font-mono);">$_______</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="print-form-footer">
        <span>OFFICIAL EXPEDITION FORM • GENERATED BY ITER VIAE TACTICAL ROUTE COMMAND</span>
        <span>PAGE ${totalPages} OF ${totalPages}</span>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

function printManifestDocument() {
  renderPrintManifest();
  const manifestContainer = document.getElementById("print-manifest-container");
  if (!manifestContainer) return;

  const printWin = window.open("", "_blank", "width=950,height=850");
  if (!printWin) {
    // If popup blocked, fallback to active page window.print()
    manifestContainer.style.display = "block";
    window.print();
    manifestContainer.style.display = "none";
    return;
  }

  const manifestHtml = manifestContainer.innerHTML;

  printWin.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>${currentTripTitle} - Expedition Manifest</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=JetBrains+Mono:wght@500;700;800&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          background: #ffffff;
          color: #0f172a;
          margin: 0;
          padding: 20px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .print-form-card {
          width: 190mm !important;
          height: 245mm !important;
          max-height: 245mm !important;
          margin: 0 auto !important;
          padding: 10mm !important;
          border: 2px solid #0f172a !important;
          background: #ffffff !important;
          box-sizing: border-box !important;
          overflow: hidden !important;
          display: flex !important;
          flex-direction: column !important;
          justify-content: space-between !important;
        }
        .print-form-header { margin-bottom: 12px; }
        .print-form-brand-row { display: flex; justify-content: space-between; align-items: flex-start; }
        .print-form-logo-group { display: flex; flex-direction: column; }
        .print-logo-text { font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 900; letter-spacing: 0.1em; color: #0f172a; }
        .print-logo-sub { font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 800; color: #475569; letter-spacing: 0.08em; }
        .print-form-meta-box { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: #334155; text-align: right; line-height: 1.4; border-left: 2px solid #cbd5e1; padding-left: 10px; }
        .print-form-divider { height: 2px; background: #0f172a; margin-top: 8px; }
        .print-form-section {
          margin-bottom: 14px;
          page-break-inside: avoid;
          break-inside: avoid;
        }
        .print-form-section-head { font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 900; letter-spacing: 0.08em; background: #0f172a; color: #ffffff; padding: 4px 8px; margin-bottom: 6px; }
        .print-form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .print-form-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
        .print-form-field { border: 1px solid #cbd5e1; padding: 5px 8px; background: #f8fafc; display: flex; flex-direction: column; }
        .print-field-label { font-family: 'JetBrains Mono', monospace; font-size: 8px; font-weight: 800; color: #64748b; margin-bottom: 2px; }
        .print-field-value { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 800; color: #0f172a; }
        .print-form-table { width: 100%; border-collapse: collapse; font-size: 10px; border: 1px solid #cbd5e1; }
        .print-form-table th { background: #e2e8f0; color: #0f172a; font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 800; text-align: left; padding: 5px 6px; border: 1px solid #cbd5e1; }
        .print-form-table td { padding: 5px 6px; border: 1px solid #e2e8f0; color: #1e293b; }
        .print-form-table tr { page-break-inside: avoid; break-inside: avoid; }
        .print-form-table tr:nth-child(even) td { background: #f8fafc; }
        .print-notes-box { border: 1px solid #cbd5e1; background: #f8fafc; padding: 8px 10px; page-break-inside: avoid; break-inside: avoid; }
        .print-blank-lines { display: flex; flex-direction: column; gap: 16px; margin-top: 10px; margin-bottom: 4px; }
        .print-line { border-bottom: 1px dashed #cbd5e1; height: 1px; }
        .print-budget-totals-row td { background: #e2e8f0 !important; border-top: 2px solid #0f172a !important; }
        .print-form-footer { display: flex; justify-content: space-between; font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 6px; margin-top: 10px; }
        .print-page-break {
          page-break-before: always !important;
          break-before: page !important;
          height: 0;
          display: block;
          clear: both;
        }
        .print-page-2 {
          page-break-before: always !important;
          break-before: page !important;
          margin-top: 0 !important;
        }
        @media print {
          @page { size: letter portrait; margin: 0mm !important; }
          .print-page-break { page-break-before: always !important; break-before: page !important; }
          .print-page-2 { page-break-before: always !important; break-before: page !important; margin-top: 0 !important; }
        }
      </style>
    </head>
    <body>
      ${manifestHtml}
    </body>
    </html>
  `);

  printWin.document.close();
  printWin.focus();
  setTimeout(() => {
    printWin.print();
    printWin.close();
  }, 250);
}

const printManifestBtn = document.getElementById("print-manifest-btn");
if (printManifestBtn) {
  printManifestBtn.addEventListener("click", printManifestDocument);
}

// Live Itinerary Start Time Change Handler
if (itineraryStartTimeInput) {
  itineraryStartTimeInput.addEventListener("change", () => {
    expeditionStartTime = itineraryStartTimeInput.value;
    renderItinerarySpreadsheet();
  });
}

// Live Table Inputs & Toggles Event Delegation
if (itineraryTableBody) {
  itineraryTableBody.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    // Overnight Toggle Button
    const overnightBtn = target.closest(".btn-overnight-toggle") as HTMLButtonElement;
    if (overnightBtn && overnightBtn.dataset.wpId) {
      const wpId = overnightBtn.dataset.wpId;
      const wp = waypoints.find((w) => w.id === wpId);
      if (wp) {
        wp.isOvernight = !wp.isOvernight;
        renderItinerarySpreadsheet();
        updateLegBadgesUI();
      }
      return;
    }

    // Fuel Stop Toggle Button
    const fuelBtn = target.closest(".btn-fuel-toggle") as HTMLButtonElement;
    if (fuelBtn && fuelBtn.dataset.wpId) {
      const wpId = fuelBtn.dataset.wpId;
      const wp = waypoints.find((w) => w.id === wpId);
      if (wp) {
        wp.isFuelStop = !wp.isFuelStop;
        renderWaypointsUI();
        renderItinerarySpreadsheet();
        updateLegBadgesUI();
        showToast(wp.isFuelStop ? `Marked ${wp.title || 'Stop'} as Refuel Point ⛽` : `Removed Refuel Point flag`);
      }
      return;
    }
  });

  itineraryTableBody.addEventListener("input", (e) => {
    const target = e.target as HTMLInputElement;
    if (!target) return;

    const wpId = target.dataset.wpId;
    if (!wpId) return;

    const wp = waypoints.find((w) => w.id === wpId);
    if (!wp) return;

    if (target.classList.contains("table-input-break")) {
      const val = parseFloat(target.value);
      wp.breakMin = isNaN(val) || val < 0 ? 0 : val;
      updateItineraryCalculations();
    } else if (target.classList.contains("table-input-budget")) {
      const val = parseFloat(target.value);
      wp.budget = isNaN(val) || val < 0 ? 0 : val;
      updateItineraryCalculations();
    } else if (target.classList.contains("table-input-notes")) {
      wp.notes = target.value;
    }
  });

  // Format budget input to 2 decimal places on focusout (e.g. 15.5 -> 15.50)
  itineraryTableBody.addEventListener("focusout", (e) => {
    const target = e.target as HTMLInputElement;
    if (target && target.classList.contains("table-input-budget")) {
      const val = parseFloat(target.value);
      if (!isNaN(val) && val > 0) {
        target.value = val.toFixed(2);
      }
    }
  });

  // Click Overnight Stay Toggle
  itineraryTableBody.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement).closest(".btn-overnight-toggle") as HTMLButtonElement;
    if (!target) return;

    const wpId = target.dataset.wpId;
    if (!wpId) return;

    const wp = waypoints.find((w) => w.id === wpId);
    if (!wp) return;

    wp.isOvernight = !wp.isOvernight;
    renderItinerarySpreadsheet();
    showToast(wp.isOvernight ? `Marked stop as Overnight Stay!` : `Removed Overnight Stay.`);
  });

  // Change Overnight Depart Time Select
  itineraryTableBody.addEventListener("change", (e) => {
    const target = e.target as HTMLSelectElement;
    if (!target || !target.classList.contains("overnight-depart-select")) return;

    const wpId = target.dataset.wpId;
    if (!wpId) return;

    const wp = waypoints.find((w) => w.id === wpId);
    if (!wp) return;

    wp.overnightDepartHour = parseInt(target.value, 10);
    renderItinerarySpreadsheet();
  });
}

// Reset Breaks & Export CSV Toolbar Actions
if (resetBreaksBtn) {
  resetBreaksBtn.addEventListener("click", () => {
    waypoints.forEach((wp) => {
      wp.breakMin = 0;
      wp.isOvernight = false;
    });
    renderItinerarySpreadsheet();
    showToast("Reset all waypoint rest/break durations to 0 min.");
  });
}

if (exportCsvBtn) {
  exportCsvBtn.addEventListener("click", exportItineraryCSV);
}

// Helper to extract detailed validation error strings from PocketBase ClientResponseError
function extractPocketBaseError(err: any): string {
  console.log("PocketBase Raw Error:", err, "err.data:", err?.data, "err.response:", err?.response);
  const data = err?.response?.data || err?.data?.data || err?.data;
  if (!data) return err?.message || "Unknown error";

  if (typeof data === "object") {
    const messages: string[] = [];
    for (const [key, val] of Object.entries(data)) {
      if (key === "code" || key === "message") continue;
      if (typeof val === "object" && val !== null) {
        const valObj = val as any;
        messages.push(`• Field '${key}': ${valObj.message || valObj.code || JSON.stringify(valObj)}`);
      } else {
        messages.push(`• Field '${key}': ${val}`);
      }
    }
    if (messages.length > 0) return messages.join("\n");
  }

  return err?.message || JSON.stringify(data);
}

// Save & Update Trip to Cloud Backend (PocketBase - Progressive Fallbacks)
if (saveTripBtn) {
  saveTripBtn.addEventListener("click", async () => {
    if (!PocketBaseAuth.isAuthenticated()) {
      alert("Please sign in to save trips to your private cloud logbook.");
      openAuthModal();
      return;
    }

    const user = PocketBaseAuth.getUser() as any;

    try {
      saveTripBtn.textContent = "Saving...";

      const baseMetrics = {
        distance: metricDistance?.textContent || "0.0 MI",
        duration: metricDuration?.textContent || "0H 0M",
        summary: currentTripSummary,
        vehicleProfile: vehicleProfile,
        itinerary: {
          startTime: expeditionStartTime
        }
      };

      // Payload 1: Full payload including route_geometry, summary, and itinerary
      const payload1: any = {
        user: user.id,
        title: currentTripTitle,
        status: "planned",
        summary: currentTripSummary,
        waypoints: waypoints,
        route_geometry: {
          type: "FeatureCollection",
          features: []
        },
        itinerary: {
          startTime: expeditionStartTime,
          waypoints: waypoints
        },
        metrics: baseMetrics
      };

      // Attempt 1: Full Payload
      try {
        if (currentTripId) {
          await pb.collection("trips").update(currentTripId, payload1);
        } else {
          const record = await pb.collection("trips").create(payload1);
          currentTripId = record.id;
        }
        showToast("Expedition Trip saved to PocketBase Cloud!");
      } catch (err1: any) {
        console.warn("Save attempt 1 (Full Payload) failed:", extractPocketBaseError(err1));

        // Attempt 2: Standard Payload without root itinerary/summary if root columns not added yet
        const payload2: any = {
          user: user.id,
          title: currentTripTitle,
          status: "planned",
          waypoints: waypoints,
          route_geometry: {},
          metrics: baseMetrics
        };

        try {
          if (currentTripId) {
            await pb.collection("trips").update(currentTripId, payload2);
          } else {
            const record = await pb.collection("trips").create(payload2);
            currentTripId = record.id;
          }
          showToast("Expedition Trip saved to PocketBase Cloud!");
        } catch (err2: any) {
          console.warn("Save attempt 2 failed:", extractPocketBaseError(err2));

          // Attempt 3: Minimal Payload without optional status field
          const payload3: any = {
            user: user.id,
            title: currentTripTitle,
            waypoints: waypoints,
            metrics: baseMetrics
          };

          try {
            if (currentTripId) {
              await pb.collection("trips").update(currentTripId, payload3);
            } else {
              const record = await pb.collection("trips").create(payload3);
              currentTripId = record.id;
            }
            showToast("Expedition Trip saved to PocketBase Cloud!");
          } catch (err3: any) {
            console.error("All save attempts failed. Final error:", err3);
            const errDetails = extractPocketBaseError(err3);
            alert("Failed to save trip to PocketBase Cloud:\n\n" + errDetails);
          }
        }
      }

      saveTripBtn.textContent = "💾 Save Cloud";
    } catch (err: any) {
      saveTripBtn.textContent = "💾 Save Cloud";
      console.error("Save process error:", err);
      alert("Error saving trip: " + (err.message || extractPocketBaseError(err)));
    }
  });
}

// Load User Saved Trips from PocketBase (Strictly User-Scoped Filter for Privacy)
async function loadUserSavedTrips() {
  if (!savedTripsList) return;
  if (!PocketBaseAuth.isAuthenticated()) {
    alert("Please sign in to view your saved expedition routes.");
    openAuthModal();
    return;
  }

  const user = PocketBaseAuth.getUser() as any;

  if (savedTripsLoading) savedTripsLoading.style.display = "block";
  if (savedTripsEmpty) savedTripsEmpty.style.display = "none";
  savedTripsList.innerHTML = "";

  try {
    // Strictly filter by current authenticated user ID so users never see other users' routes!
    const records = await pb.collection("trips").getFullList({
      filter: `user = "${user.id}"`,
      sort: "-updated"
    });

    if (savedTripsLoading) savedTripsLoading.style.display = "none";

    if (records.length === 0) {
      if (savedTripsEmpty) savedTripsEmpty.style.display = "block";
      return;
    }

    records.forEach((record: any) => {
      const isCurrentActive = record.id === currentTripId;

      const card = document.createElement("div");
      card.className = `trip-card-item ${isCurrentActive ? 'active-loaded' : ''}`;

      const waypointsCount = Array.isArray(record.waypoints) ? record.waypoints.length : 0;
      const distance = record.metrics?.distance || "0.0 MI";
      const duration = record.metrics?.duration || "0H 0M";
      const dateString = record.updated ? new Date(record.updated).toLocaleDateString() : "";

      card.innerHTML = `
        <div class="trip-card-header">
          <span class="trip-card-title">${record.title || "UNTITLED TRIP"}</span>
          <span class="badge badge-primary">${(record.status || "PLANNED").toUpperCase()}</span>
        </div>
        <div class="trip-card-meta">
          <span>📍 ${waypointsCount} Waypoints</span>
          <span>•</span>
          <span>📏 ${distance}</span>
          <span>•</span>
          <span>⏱️ ${duration}</span>
          ${dateString ? `<span>•</span><span>📅 ${dateString}</span>` : ""}
        </div>
        ${record.summary ? `<p style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px;">${record.summary}</p>` : ""}
        <div class="trip-card-actions">
          <button class="btn btn-primary btn-sm btn-load-trip" data-id="${record.id}">
            ${isCurrentActive ? '✓ Currently Loaded' : '📂 Load Route'}
          </button>
          <button class="btn btn-outline btn-sm btn-delete-trip" data-id="${record.id}" style="color: #f87171; border-color: rgba(239,68,68,0.3);">
            🗑️ Delete
          </button>
        </div>
      `;

      savedTripsList.appendChild(card);
    });
  } catch (err: any) {
    if (savedTripsLoading) savedTripsLoading.style.display = "none";
    console.error("Error loading user trips from PocketBase:", err);
    alert("Failed to load saved trips: " + (err.message || "Unknown error"));
  }
}

// Fit map camera bounds to encompass all waypoints cleanly
function fitMapToAllWaypoints() {
  if (!map) return;
  const valid = waypoints.filter((w) => w.lat !== null && w.lon !== null);
  if (valid.length === 0) return;

  if (valid.length === 1) {
    map.flyTo({ center: [valid[0].lon!, valid[0].lat!], zoom: 12 });
    return;
  }

  const bounds = new maplibregl.LngLatBounds();
  valid.forEach((w) => {
    bounds.extend([w.lon!, w.lat!]);
  });

  map.fitBounds(bounds, {
    padding: { top: 80, bottom: 80, left: 380, right: 80 },
    maxZoom: 14,
    duration: 1000
  });
}

// Load Specific Saved Trip into Workspace Map
async function loadTripIntoWorkspace(tripId: string) {
  try {
    const record = await pb.collection("trips").getOne(tripId);
    if (!record) return;

    currentTripId = record.id;
    currentTripTitle = (record.title || "MY EXPEDITION ROUTE").toUpperCase();
    currentTripSummary = record.summary || record.metrics?.summary || "";

    if (modalTripSummary) {
      modalTripSummary.value = currentTripSummary;
    }

    if (Array.isArray(record.waypoints) && record.waypoints.length >= 2) {
      waypoints = record.waypoints;
    }

    if (record.itinerary?.startTime) {
      expeditionStartTime = record.itinerary.startTime;
    }

    if (record.metrics?.vehicleProfile) {
      vehicleProfile = record.metrics.vehicleProfile;
      if (fuelMpgInput) fuelMpgInput.value = (vehicleProfile.mpg || 18).toString();
      if (tankCapacityInput) tankCapacityInput.value = (vehicleProfile.tankCapacityGal || 20).toString();
      if (fuelPriceInput) fuelPriceInput.value = (vehicleProfile.fuelPricePerGal || 3.65).toString();
      if (reserveGalInput) reserveGalInput.value = (vehicleProfile.reserveGal || 2).toString();
      if (fuelTrackingToggle) fuelTrackingToggle.checked = vehicleProfile.enabled !== false;
      updateFuelCalculations();
    }

    if (tripTitleText) tripTitleText.textContent = currentTripTitle;

    renderWaypointsUI();
    await updateExpeditionRoute();
    fitMapToAllWaypoints();

    closeSavedTripsModal();
    showToast(`Loaded Expedition Route: ${currentTripTitle}`);
  } catch (err: any) {
    console.error("Failed to load trip record:", err);
    alert("Error loading trip: " + err.message);
  }
}

// Vehicle Profile Input Event Listeners
if (fuelMpgInput) fuelMpgInput.addEventListener("input", updateFuelCalculations);
if (tankCapacityInput) tankCapacityInput.addEventListener("input", updateFuelCalculations);
if (fuelPriceInput) fuelPriceInput.addEventListener("input", updateFuelCalculations);
if (reserveGalInput) reserveGalInput.addEventListener("input", updateFuelCalculations);

// Delete Specific Saved Trip
async function deleteTripFromCloud(tripId: string) {
  if (!confirm("Are you sure you want to delete this saved expedition route?")) return;

  try {
    await pb.collection("trips").delete(tripId);
    if (currentTripId === tripId) {
      currentTripId = null;
    }
    showToast("Expedition trip deleted.");
    loadUserSavedTrips();
  } catch (err: any) {
    console.error("Failed to delete trip:", err);
    alert("Error deleting trip: " + err.message);
  }
}

// Saved Trips Modal Handlers
function openSavedTripsModal() {
  if (!savedTripsModal) return;
  savedTripsModal.style.display = "flex";
  loadUserSavedTrips();
}

function closeSavedTripsModal() {
  if (savedTripsModal) savedTripsModal.style.display = "none";
}

if (navSavedTripsBtn) navSavedTripsBtn.addEventListener("click", openSavedTripsModal);
if (openSavedTripsBtn) openSavedTripsBtn.addEventListener("click", openSavedTripsModal);
if (savedTripsModalClose) savedTripsModalClose.addEventListener("click", closeSavedTripsModal);

if (savedTripsList) {
  savedTripsList.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const loadBtn = target.closest(".btn-load-trip") as HTMLButtonElement;
    if (loadBtn && loadBtn.dataset.id) {
      loadTripIntoWorkspace(loadBtn.dataset.id);
      return;
    }

    const deleteBtn = target.closest(".btn-delete-trip") as HTMLButtonElement;
    if (deleteBtn && deleteBtn.dataset.id) {
      deleteTripFromCloud(deleteBtn.dataset.id);
      return;
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

  console.log("Initializing MapLibre GL Map Surface - Blank Canvas Mode...");

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

    // Trigger Browser Geolocation to center map close to user position (keep inputs blank)
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const userLat = position.coords.latitude;
          const userLon = position.coords.longitude;

          console.log(`User Geolocation centered map at: ${userLat}, ${userLon}`);

          // Fly map close to user location
          map?.flyTo({
            center: [userLon, userLat],
            zoom: 13,
            speed: 1.5,
            essential: true
          });
        },
        (error) => {
          console.warn("Geolocation positioning error or permission denied:", error.message);
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
    renderWaypointMapMarkers();
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

    // If Origin is blank, populate Origin first
    if (waypoints.length > 0 && waypoints[0].lat === null) {
      waypoints[0].lat = lat;
      waypoints[0].lon = lng;
      waypoints[0].title = waypoints[0].title || "Origin Point";
      renderWaypointsUI();
      updateExpeditionRoute();
      focusOnWaypoint(waypoints[0].id);
      hideContextMenu();
      showToast(`Set Origin at ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      return;
    }

    // If Destination is blank, populate Destination next
    if (waypoints.length > 1 && waypoints[waypoints.length - 1].lat === null) {
      const destIndex = waypoints.length - 1;
      waypoints[destIndex].lat = lat;
      waypoints[destIndex].lon = lng;
      waypoints[destIndex].title = waypoints[destIndex].title || "Destination Point";
      renderWaypointsUI();
      updateExpeditionRoute();
      focusOnWaypoint(waypoints[destIndex].id);
      hideContextMenu();
      showToast(`Set Destination at ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      return;
    }

    // Calculate optimal logical sequence position (inserts internally or extends destination)
    const insertIndex = findOptimalInsertionIndex(lat, lng);
    const isNewDestination = insertIndex >= waypoints.length;

    insertNewStopAt(insertIndex, lat, lng);

    hideContextMenu();
    if (isNewDestination) {
      showToast(`Extended Route: Set as new Destination at ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } else {
      showToast(`Inserted Waystop #${insertIndex} at ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    }
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
      if (openItineraryBtn) openItineraryBtn.style.display = "inline-flex";
      if (saveTripBtn) saveTripBtn.style.display = "inline-flex";
      if (navVehicleBtn) navVehicleBtn.style.display = "inline-flex";
      if (navSavedTripsBtn) navSavedTripsBtn.style.display = "inline-flex";
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
      if (openItineraryBtn) openItineraryBtn.style.display = "none";
      if (saveTripBtn) saveTripBtn.style.display = "none";
      if (navVehicleBtn) navVehicleBtn.style.display = "none";
      if (navSavedTripsBtn) navSavedTripsBtn.style.display = "none";
      if (guestView) guestView.style.display = "none";
      if (verifiedView) verifiedView.style.display = "none";
      if (unverifiedView) unverifiedView.style.display = "flex";
      if (appFooter) appFooter.style.display = "block";
      if (unverifiedUserEmail) unverifiedUserEmail.textContent = user?.email || "your account";
    }
  } else {
    // Guest View (Not logged in)
    if (openItineraryBtn) openItineraryBtn.style.display = "none";
    if (saveTripBtn) saveTripBtn.style.display = "none";
    if (navVehicleBtn) navVehicleBtn.style.display = "none";
    if (navSavedTripsBtn) navSavedTripsBtn.style.display = "none";
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
  console.log("openAuthModal triggered!");
  const modal = authModal || document.getElementById("auth-modal");
  const errBanner = authErrorBanner || document.getElementById("auth-error-banner");
  if (modal) {
    modal.style.setProperty("display", "flex", "important");
    modal.style.setProperty("visibility", "visible", "important");
    modal.style.setProperty("opacity", "1", "important");
  }
  if (errBanner) errBanner.style.display = "none";
}

function closeAuthModal() {
  console.log("closeAuthModal triggered!");
  const modal = authModal || document.getElementById("auth-modal");
  if (modal) {
    modal.style.setProperty("display", "none", "important");
  }
}

(window as any).openAuthModal = openAuthModal;
(window as any).closeAuthModal = closeAuthModal;

// Global Event Delegation for Sign In Buttons (100% Fail-Safe)
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (!target) return;

  if (
    target.id === "open-auth-btn" || 
    target.id === "hero-auth-btn" || 
    target.closest("#open-auth-btn, #hero-auth-btn, .btn-open-auth")
  ) {
    e.preventDefault();
    openAuthModal();
  }

  if (target.id === "auth-modal-close" || target.closest("#auth-modal-close")) {
    e.preventDefault();
    closeAuthModal();
  }
});

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
