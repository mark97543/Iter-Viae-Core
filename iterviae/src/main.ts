import "./styles.css";
import maplibregl from "maplibre-gl";
import { pb, PocketBaseAuth } from "./pocketbase";
import { fetchIncrementalExpeditionRoute, haversineDistance, encodePolyline6, decodePolyline6, LegMetric, RouteLeg } from "./valhalla";

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
const newTripBtn = document.getElementById("new-trip-btn");
const saveTripBtn = document.getElementById("save-trip-btn");
const exportGPXBtn = document.getElementById("export-gpx-btn");
const importGPXBtn = document.getElementById("import-gpx-btn");
const importGPXInput = document.getElementById("import-gpx-input") as HTMLInputElement;

const poiResultsPanel = document.getElementById("poi-results-panel");
const poiPanelTitle = document.getElementById("poi-panel-title");
const poiPanelClose = document.getElementById("poi-panel-close");
const poiResultsList = document.getElementById("poi-results-list");
let activePoiSearchMarkers: maplibregl.Marker[] = [];

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
const toggleAllItineraryDaysBtn = document.getElementById("toggle-all-itinerary-days-btn");
const itineraryTableBody = document.getElementById("itinerary-table-body");

const collapsedItineraryDays = new Set<number>();

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

// DOM Header Navigation Dropdown References
const navExpeditionMenu = document.getElementById("nav-expedition-menu");
const toggleNavMenuBtn = document.getElementById("toggle-nav-menu-btn");
const navMenuDropdownCard = document.getElementById("nav-menu-dropdown-card");
const menuPublishBtn = document.getElementById("menu-publish-btn");
const menuSyncCloudBtn = document.getElementById("menu-sync-cloud-btn");
const menuSavedTripsBtn = document.getElementById("menu-saved-trips-btn");
const menuSaveLocalBtn = document.getElementById("menu-save-local-btn");
const menuOpenLocalBtn = document.getElementById("menu-open-local-btn");
const importIterviaeInput = document.getElementById("import-iterviae-input") as HTMLInputElement | null;
const menuRecalculateBtn = document.getElementById("menu-recalculate-btn");
const menuExportGpxBtn = document.getElementById("menu-export-gpx-btn");
const menuImportGpxBtn = document.getElementById("menu-import-gpx-btn");
const menuVehicleBtn = document.getElementById("menu-vehicle-btn");

// DOM Route Loading Overlay References
const routeLoadingModal = document.getElementById("route-loading-modal");
const routeLoadingSubtitle = document.getElementById("route-loading-subtitle");
const cancelRouteLoadingBtn = document.getElementById("cancel-route-loading-btn");
let activeRouteLoadingToken: string | null = null;

// DOM 3D Terrain & Flythrough Modal References
const modal3DViewer = document.getElementById("modal-3d-viewer");
const modal3DClose = document.getElementById("modal-3d-close");
const btn3DFlythrough = document.getElementById("btn-3d-flythrough");
const btn3DResetCam = document.getElementById("btn-3d-reset-cam");
const hudPitchVal = document.getElementById("hud-pitch-val");
const hudFlyStatus = document.getElementById("hud-fly-status");

let map3D: maplibregl.Map | null = null;
let is3DFlying: boolean = false;
let flythroughIndex: number = 0;
let flythroughTimer: any = null;

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
let currentRouteLegs: RouteLeg[] = [];
let lastRouteCoordinates: [number, number][] = [];
let currentTripId: string | null = null; // Tracks active PocketBase saved trip ID
let currentFileHandle: any = null; // Tracks active local FileSystemFileHandle for direct overwrite saves

// Multi-Day Accordions & View Mode State References
const toggleViewModeBtn = document.getElementById("toggle-view-mode-btn");
const toggleAllAccordionsBtn = document.getElementById("toggle-all-accordions-btn");

let isCompactView: boolean = false;
let collapsedDays: Set<number> = new Set();
let isAllAccordionsCollapsed: boolean = false;

const DAY_COLOR_PALETTE = [
  "#38bdf8", // Day 1: Electric Sky Blue
  "#10b981", // Day 2: Emerald Mint Green
  "#f59e0b", // Day 3: Amber Gold
  "#a855f7", // Day 4: Amethyst Purple
  "#06b6d4", // Day 5: Cyan Ocean
  "#ec4899", // Day 6: Hot Pink
  "#84cc16", // Day 7: Lime Citrus
  "#f97316", // Day 8: Vivid Safety Orange
  "#6366f1", // Day 9: Indigo Electric
  "#14b8a6"  // Day 10: Teal Topaz
];

export function getDayColor(dayNumber: number): string {
  const index = Math.max(0, dayNumber - 1);
  return DAY_COLOR_PALETTE[index % DAY_COLOR_PALETTE.length];
}

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

// 3 High-Performance API-Key-Free Map Surface Styles (Vector/Street, Dark OLED, Topo)
const MAP_SURFACE_STYLES: Record<string, any> = {
  vector: {
    version: 8 as const,
    sources: {
      "esri-street": {
        type: "raster" as const,
        tiles: [
          "https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
        ],
        tileSize: 256,
        maxzoom: 17,
        attribution: "© Esri, HERE, Garmin, USGS, NGA, EPA, USDA, NPS"
      }
    },
    layers: [
      { id: "esri-street-layer", type: "raster" as const, source: "esri-street", minzoom: 0, maxzoom: 17 }
    ]
  },
  dark: {
    version: 8 as const,
    sources: {
      "esri-dark": {
        type: "raster" as const,
        tiles: [
          "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        ],
        tileSize: 256,
        maxzoom: 16,
        attribution: "© Esri, HERE, Garmin, NGA, USGS"
      }
    },
    layers: [
      { id: "esri-dark-layer", type: "raster" as const, source: "esri-dark", minzoom: 0, maxzoom: 16 }
    ]
  },
  topo: {
    version: 8 as const,
    sources: {
      "esri-topo": {
        type: "raster" as const,
        tiles: [
          "https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}"
        ],
        tileSize: 256,
        maxzoom: 17,
        attribution: "© Esri, HERE, Garmin, Intermap, USGS, NPS"
      }
    },
    layers: [
      { id: "esri-topo-layer", type: "raster" as const, source: "esri-topo", minzoom: 0, maxzoom: 17 }
    ]
  },
  terrain3d: {
    version: 8 as const,
    sources: {
      "esri-satellite": {
        type: "raster" as const,
        tiles: [
          "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        ],
        tileSize: 256,
        maxzoom: 17,
        attribution: "© Esri, Maxar, Earthstar Geographics"
      },
      "terrarium-dem": {
        type: "raster-dem" as const,
        tiles: [
          "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
        ],
        encoding: "terrarium" as const,
        tileSize: 256,
        maxzoom: 15
      }
    },
    layers: [
      { id: "esri-satellite-layer", type: "raster" as const, source: "esri-satellite", minzoom: 0, maxzoom: 17 }
    ],
    terrain: {
      source: "terrarium-dem",
      exaggeration: 1.5
    }
  }
};

function splitCoordinatesIntoDaySegments(
  coords: [number, number][],
  waypointsList: Waypoint[],
  routeLegs: RouteLeg[] = []
): [number, number][][] {
  const validWaypoints = waypointsList.filter((w) => w.lat !== null && w.lon !== null);
  if (coords.length < 2 || validWaypoints.length < 2) return [coords];

  // 1. Primary path: Partition by exact RouteLeg geometries if full coordinates are present
  if (routeLegs && routeLegs.length === validWaypoints.length - 1) {
    const daySegments: [number, number][][] = [];
    let currentDayCoords: [number, number][] = [];

    for (let i = 0; i < routeLegs.length; i++) {
      let legCoords = routeLegs[i].coordinates;
      if ((!legCoords || legCoords.length === 0) && routeLegs[i].encodedPolyline) {
        legCoords = decodePolyline6(routeLegs[i].encodedPolyline!);
        routeLegs[i].coordinates = legCoords;
      }
      if (!legCoords || legCoords.length === 0) continue;

      if (currentDayCoords.length === 0) {
        currentDayCoords.push(...legCoords);
      } else {
        currentDayCoords.push(...legCoords.slice(1));
      }

      const destWp = validWaypoints[i + 1];
      const isOvernightStop = Boolean(destWp && destWp.isOvernight);
      const isFinalLeg = (i === routeLegs.length - 1);

      if (isOvernightStop || isFinalLeg) {
        if (currentDayCoords.length >= 2) {
          daySegments.push(currentDayCoords);
        }
        currentDayCoords = [];
      }
    }

    if (daySegments.length > 0) {
      return daySegments;
    }
  }

  // 2. High-Accuracy Fallback: Find exact closest polyline vertex index for each overnight hotel stop
  const splitIndices: number[] = [0];
  let searchStartIdx = 0;

  for (let i = 0; i < validWaypoints.length - 1; i++) {
    const wp = validWaypoints[i];
    if (i > 0 && wp.isOvernight) {
      let minDist = Infinity;
      let bestIdx = searchStartIdx;

      for (let c = searchStartIdx; c < coords.length; c++) {
        const dist = haversineDistance(wp.lat!, wp.lon!, coords[c][1], coords[c][0]);
        if (dist < minDist) {
          minDist = dist;
          bestIdx = c;
        }
      }

      splitIndices.push(bestIdx);
      searchStartIdx = bestIdx;
    }
  }

  splitIndices.push(coords.length - 1);

  const daySegments: [number, number][][] = [];
  for (let s = 0; s < splitIndices.length - 1; s++) {
    const startIdx = splitIndices[s];
    const endIdx = splitIndices[s + 1];
    const seg = coords.slice(startIdx, endIdx + 1);
    if (seg.length >= 2) {
      daySegments.push(seg);
    }
  }

  return daySegments.length > 0 ? daySegments : [coords];
}

// Synchronously redraw stored route line & fuel line on map surface with per-day colors
function redrawRouteLine() {
  if (!map || !lastRouteCoordinates || lastRouteCoordinates.length < 2) return;

  const daySegments = splitCoordinatesIntoDaySegments(lastRouteCoordinates, waypoints, currentRouteLegs);
  console.log(`Redrawing route line: ${daySegments.length} day segment(s), ${lastRouteCoordinates.length} total road points.`);

  const routeGeoJSON: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: daySegments.map((seg, dayIdx) => ({
      type: "Feature",
      properties: {
        dayIndex: dayIdx + 1,
        color: getDayColor(dayIdx + 1)
      },
      geometry: {
        type: "LineString",
        coordinates: seg
      }
    }))
  };

  const applyLayers = () => {
    if (!map) return;

    try {
      const src = map.getSource("expedition-route-src") as maplibregl.GeoJSONSource;
      if (src) {
        src.setData(routeGeoJSON);
      } else {
        map.addSource("expedition-route-src", {
          type: "geojson",
          data: routeGeoJSON
        });
      }

      const beforeId = map.getLayer("waypoints-symbols-pins") ? "waypoints-symbols-pins" : undefined;

      if (!map.getLayer("expedition-route-casing")) {
        map.addLayer({
          id: "expedition-route-casing",
          type: "line",
          source: "expedition-route-src",
          layout: {
            "line-join": "round",
            "line-cap": "round"
          },
          paint: {
            "line-color": "#000000",
            "line-width": 8,
            "line-opacity": 0.6
          }
        }, beforeId);
      }

      if (!map.getLayer("expedition-route-layer")) {
        map.addLayer({
          id: "expedition-route-layer",
          type: "line",
          source: "expedition-route-src",
          layout: {
            "line-join": "round",
            "line-cap": "round"
          },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 5,
            "line-opacity": 0.95
          }
        }, beforeId);
      }

      if (map.getLayer("waypoints-symbols-pins")) {
        map.moveLayer("waypoints-symbols-pins");
      }

      if (vehicleProfile.enabled && lastRouteCoordinates.length > 1) {
        updateFuelExhaustionMapOverlay(lastRouteCoordinates);
      }

      map.triggerRepaint();
    } catch (err) {
      console.warn("Layer re-creation delayed:", err);
    }
  };

  applyLayers();
  setTimeout(applyLayers, 80);
  setTimeout(applyLayers, 300);
}

function changeMapStyle(styleKey: string) {
  if (!map || !MAP_SURFACE_STYLES[styleKey]) return;
  showToast(`Switching map theme to ${styleKey.toUpperCase()}...`);

  const reapplyAllLayers = () => {
    if (!map) return;
    renderWaypointMapMarkers();
    redrawRouteLine();
  };

  try {
    map.setStyle(MAP_SURFACE_STYLES[styleKey]);

    map.once("style.load", () => {
      reapplyAllLayers();
      if (styleKey === "terrain3d") {
        map?.easeTo({ pitch: 60, bearing: -20, duration: 800 });
      } else {
        map?.easeTo({ pitch: 0, bearing: 0, duration: 600 });
      }
    });

    map.once("idle", () => {
      reapplyAllLayers();
    });
  } catch (err) {
    console.error("Failed to set map style:", err);
  }
}

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

  let validIdx = 0;

  waypoints.forEach((wp, idx) => {
    let legTravelSec = 0;
    let legDistanceMi = 0;

    const isPlaced = wp.lat !== null && wp.lon !== null;

    if (isPlaced) {
      if (validIdx > 0) {
        const legMetric = currentLegMetrics[validIdx - 1];
        if (legMetric) {
          legTravelSec = legMetric.durationSec;
          legDistanceMi = legMetric.distanceMi;
        }
      }
      validIdx++;
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

  let validIdx = 0;

  waypoints.forEach((wp, idx) => {
    let legTravelSec = 0;
    let legDistanceMi = 0;

    const isPlaced = wp.lat !== null && wp.lon !== null;

    if (isPlaced) {
      if (validIdx > 0) {
        const legMetric = currentLegMetrics[validIdx - 1];
        if (legMetric) {
          legTravelSec = legMetric.durationSec;
          legDistanceMi = legMetric.distanceMi;
        }
      }
      validIdx++;
    }

    totalTravelSec += legTravelSec;
    totalDistanceMi += legDistanceMi;
    currentMillis += legTravelSec * 1000;

    const etaDate = new Date(currentMillis);

    // Insert Day Banner Row at start or after an overnight stay
    if (idx === 0 || (idx > 0 && waypoints[idx - 1].isOvernight)) {
      if (idx > 0) currentDay++;

      // Compute stats for this day section
      let dayStopsCount = 0;
      let dayTravelSecTotal = 0;
      let dayDistanceMiTotal = 0;
      let tempVIdx = validIdx;

      for (let j = idx; j < waypoints.length; j++) {
        if (j > idx && waypoints[j - 1].isOvernight) {
          break;
        }
        dayStopsCount++;
        const w = waypoints[j];
        if (w.lat !== null && w.lon !== null) {
          if (tempVIdx > 0) {
            const legMetric = currentLegMetrics[tempVIdx - 1];
            if (legMetric) {
              dayTravelSecTotal += legMetric.durationSec;
              dayDistanceMiTotal += legMetric.distanceMi;
            }
          }
          tempVIdx++;
        }
      }

      const isDayCollapsed = collapsedItineraryDays.has(currentDay);

      const dayHeaderTr = document.createElement("tr");
      dayHeaderTr.className = `day-header-row ${isDayCollapsed ? "is-collapsed" : ""}`;
      dayHeaderTr.dataset.dayNum = String(currentDay);
      dayHeaderTr.innerHTML = `
        <td colspan="9">
          <div class="day-header-content">
            <div class="day-header-title">
              <span class="day-toggle-icon">▼</span>
              <span>🗓️ DAY ${currentDay}</span>
              <span>—</span>
              <span>${formatDayHeaderDate(etaDate)}</span>
            </div>
            <div class="day-header-right">
              <span class="day-header-summary-pill">${dayStopsCount} ${dayStopsCount === 1 ? 'STOP' : 'STOPS'} • ${formatDuration(dayTravelSecTotal)} • ${dayDistanceMiTotal.toFixed(1)} MI</span>
            </div>
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
    tr.dataset.dayNum = String(currentDay);
    if (collapsedItineraryDays.has(currentDay)) {
      tr.className = "collapsed-day-row";
    }

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
              id="itin-break-${wp.id}"
              name="itin_break_${wp.id}"
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
          id="itin-budget-${wp.id}"
          name="itin_budget_${wp.id}"
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
          id="itin-notes-${wp.id}"
          name="itin_notes_${wp.id}"
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

  // Update Toolbar Toggle Button State
  if (toggleAllItineraryDaysBtn) {
    if (collapsedItineraryDays.size >= currentDay && currentDay > 0) {
      toggleAllItineraryDaysBtn.textContent = "▲ Expand Days";
    } else {
      toggleAllItineraryDaysBtn.textContent = "▼ Collapse Days";
    }
  }
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

  let validIdx = 0;

  waypoints.forEach((wp, idx) => {
    let legTravelSec = 0;
    let legDistanceMi = 0;

    const isPlaced = wp.lat !== null && wp.lon !== null;

    if (isPlaced) {
      if (validIdx > 0) {
        const legMetric = currentLegMetrics[validIdx - 1];
        if (legMetric) {
          legTravelSec = legMetric.durationSec;
          legDistanceMi = legMetric.distanceMi;
        }
      }
      validIdx++;
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
async function updateExpeditionRoute(forceClearCache: boolean = false) {
  if (!map) return;

  if (forceClearCache) {
    currentRouteLegs = [];
  }

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
    currentRouteLegs = [];
    lastRouteCoordinates = [];
    updateLegBadgesUI();
    return;
  }

  try {
    const { coordinates, distanceMi, durationSec, legs, routeLegs } = await fetchIncrementalExpeditionRoute(validLocations, currentRouteLegs);
    currentLegMetrics = legs;
    currentRouteLegs = routeLegs;
    lastRouteCoordinates = coordinates;

    // Update main bottom metrics
    if (metricDistance) metricDistance.textContent = `${distanceMi.toFixed(1)} MI`;
    if (metricDuration) metricDuration.textContent = formatDuration(durationSec);

    redrawRouteLine();

    // Cache active trip draft locally in LocalStorage for instant refresh speed
    try {
      localStorage.setItem("iterviae_active_route_draft", JSON.stringify({
        tripId: currentTripId,
        title: currentTripTitle,
        waypoints,
        coordinates: lastRouteCoordinates,
        legs: currentLegMetrics,
        routeLegs: currentRouteLegs,
        updated: new Date().toISOString()
      }));
    } catch (e) {
      // LocalStorage quota safeguard
    }
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

  if (!map.getSource("expedition-empty-route-src")) {
    map.addSource("expedition-empty-route-src", {
      type: "geojson",
      data: emptyGeoJSON
    });
  } else {
    (map.getSource("expedition-empty-route-src") as maplibregl.GeoJSONSource).setData(emptyGeoJSON);
  }

  if (!map.getLayer("expedition-empty-route-casing")) {
    const beforeId = map.getLayer("waypoints-symbols-pins") ? "waypoints-symbols-pins" : undefined;
    map.addLayer({
      id: "expedition-empty-route-casing",
      type: "line",
      source: "expedition-empty-route-src",
      layout: {
        "line-join": "round",
        "line-cap": "round"
      },
      paint: {
        "line-color": "#0f172a",
        "line-width": 9,
        "line-opacity": 0.95
      }
    }, beforeId);
  }

  if (!map.getLayer("expedition-empty-route-layer")) {
    const beforeId = map.getLayer("waypoints-symbols-pins") ? "waypoints-symbols-pins" : undefined;
    map.addLayer({
      id: "expedition-empty-route-layer",
      type: "line",
      source: "expedition-empty-route-src",
      layout: {
        "line-join": "round",
        "line-cap": "round"
      },
      paint: {
        "line-color": "#ff1744",
        "line-width": 5.5,
        "line-dasharray": [2.5, 2.5],
        "line-opacity": 1.0
      }
    }, beforeId);
  }

  if (map.getLayer("expedition-empty-route-layer")) {
    const beforeId = map.getLayer("waypoints-symbols-pins") ? "waypoints-symbols-pins" : undefined;
    if (beforeId) {
      map.moveLayer("expedition-empty-route-layer", beforeId);
    } else {
      map.moveLayer("expedition-empty-route-layer");
    }
  }

  if (map.getLayer("waypoints-symbols-pins")) {
    map.moveLayer("waypoints-symbols-pins");
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

// Synchronize vehicleProfile object to UI DOM inputs and update calculations
export function syncVehicleProfileToUI(profile: Partial<VehicleProfile>) {
  if (!profile) return;
  const mpg = profile.mpg || 18;
  const tank = profile.tankCapacityGal || 20;
  const price = profile.fuelPricePerGal || 3.65;
  const reserve = profile.reserveGal || 2;
  const enabled = profile.enabled !== false;

  vehicleProfile = { mpg, tankCapacityGal: tank, fuelPricePerGal: price, reserveGal: reserve, enabled };

  if (fuelMpgInput) fuelMpgInput.value = mpg.toString();
  if (tankCapacityInput) tankCapacityInput.value = tank.toString();
  if (fuelPriceInput) fuelPriceInput.value = price.toString();
  if (reserveGalInput) reserveGalInput.value = reserve.toString();
  if (fuelTrackingToggle) fuelTrackingToggle.checked = enabled;

  updateFuelCalculations();
}

// Update Waypoint Card Line 2 Arrival & Departure Badges
function updateWaypointCardTiming() {
  let currentMillis = Date.parse(expeditionStartTime);
  if (isNaN(currentMillis)) currentMillis = Date.now();

  let validIdx = 0;

  waypoints.forEach((wp, idx) => {
    const arrEl = document.getElementById(`wp-arr-${wp.id}`);
    const depEl = document.getElementById(`wp-dep-${wp.id}`);

    const isPlaced = wp.lat !== null && wp.lon !== null;
    let legMetric: LegMetric | undefined = undefined;

    if (isPlaced) {
      if (validIdx > 0) {
        legMetric = currentLegMetrics[validIdx - 1];
      }
      validIdx++;
    }

    if (idx === 0) {
      const depDate = new Date(currentMillis);
      if (arrEl) arrEl.textContent = "🚀 START";
      if (depEl) depEl.textContent = formatTimeOnly(depDate);
      return;
    }

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
  let validIdx = 0;

  for (let idx = 1; idx < waypoints.length; idx++) {
    const legIndex = idx - 1;
    const badgeEl = document.getElementById(`leg-badge-${legIndex}`);
    if (!badgeEl) continue;

    const wp = waypoints[idx];
    const prevWp = waypoints[idx - 1];

    let legMetric: LegMetric | undefined = undefined;

    if (wp.lat !== null && wp.lon !== null && prevWp.lat !== null && prevWp.lon !== null) {
      if (validIdx < currentLegMetrics.length) {
        legMetric = currentLegMetrics[validIdx];
      } else {
        const dist = haversineDistance(prevWp.lat, prevWp.lon, wp.lat, wp.lon);
        legMetric = { distanceMi: dist, durationSec: (dist / 50) * 3600 };
      }
      validIdx++;
    }

    if (legMetric) {
      accumulatedTankDistance += legMetric.distanceMi;

      if (isEnabled && accumulatedTankDistance > maxRange) {
        badgeEl.className = "leg-badge leg-range-warning";
        badgeEl.textContent = `⚠️ RANGE WARNING: ${accumulatedTankDistance.toFixed(1)} MI ON TANK > ${maxRange.toFixed(1)} MI MAX RANGE`;
      } else {
        badgeEl.className = "leg-badge";
        badgeEl.textContent = `↓ ${legMetric.distanceMi.toFixed(1)} MI • ${formatDuration(legMetric.durationSec)}`;
      }
    } else {
      badgeEl.className = "leg-badge";
      badgeEl.textContent = `↓ ENTER WAYPOINTS...`;
    }

    const currentCategory = getCategoryForWaypoint(wp);
    if (currentCategory === "gas") {
      accumulatedTankDistance = 0;
    }
  }

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
        id="popup-title-${wp.id}"
        name="popup_title_${wp.id}"
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

const markerImageDataCache = new Map<string, ImageData>();

export function createVectorMarkerImageData(color: string, text: string): ImageData {
  const cacheKey = `${color}_${text}`;
  if (markerImageDataCache.has(cacheKey)) {
    return markerImageDataCache.get(cacheKey)!;
  }

  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  ctx.clearRect(0, 0, size, size);

  // Background Circle
  ctx.beginPath();
  ctx.arc(16, 16, 13, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Dark Border Stroke
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "#0f172a";
  ctx.stroke();

  // Centered Bold White Stop Number Text
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 11px Inter, system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 16, 16.5);

  const imgData = ctx.getImageData(0, 0, size, size);
  markerImageDataCache.set(cacheKey, imgData);
  return imgData;
}

function renderWaypointMapMarkers() {
  if (!map) return;

  // Clear existing DOM waypoint markers if any exist
  waypointMapMarkers.forEach((item) => item.marker.remove());
  waypointMapMarkers = [];

  const validWaypoints = waypoints
    .map((wp, idx) => ({ wp, idx }))
    .filter(({ wp }) => wp.lat !== null && wp.lon !== null);

  if (validWaypoints.length === 0) {
    return;
  }

  validWaypoints.forEach(({ wp, idx }) => {
    const isFirst = idx === 0;
    const isLast = idx === waypoints.length - 1;
    const currentCat = getCategoryForWaypoint(wp);
    const catDetails = CATEGORY_DETAILS[currentCat];

    let markerColor = catDetails ? catDetails.color : "#38bdf8";
    let indexString = (idx + 1).toString();

    if (isFirst) {
      markerColor = "#10b981";
      indexString = "A";
    } else if (isLast) {
      markerColor = "#ef4444";
      indexString = "B";
    }

    // Create custom DOM element for Draggable Pin Marker (No CSS transitions to prevent map pan lag!)
    const el = document.createElement("div");
    el.className = "custom-draggable-marker";
    el.style.width = "30px";
    el.style.height = "30px";
    el.style.borderRadius = "50%";
    el.style.backgroundColor = markerColor;
    el.style.color = "#ffffff";
    el.style.fontWeight = "800";
    el.style.fontSize = "12px";
    el.style.fontFamily = "var(--font-mono, monospace)";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.border = "2px solid #ffffff";
    el.style.boxShadow = `0 0 12px ${markerColor}99, 0 4px 10px rgba(0,0,0,0.5)`;
    el.style.cursor = "grab";
    el.style.willChange = "transform";
    el.title = `Drag to move ${wp.title || 'Waypoint'} [Click for details]`;
    el.innerText = indexString;

    const popupHtml = createMarkerPopupHtml(wp, idx, markerColor, `STOP #${indexString} • ${catDetails ? catDetails.icon : "📍"}`);
    const popup = new maplibregl.Popup({ offset: 18, closeButton: true }).setHTML(popupHtml);

    const marker = new maplibregl.Marker({ element: el, draggable: true })
      .setLngLat([wp.lon!, wp.lat!])
      .setPopup(popup)
      .addTo(map!);

    marker.on("dragstart", () => {
      el.style.cursor = "grabbing";
      el.style.boxShadow = `0 0 22px ${markerColor}, 0 6px 14px rgba(0,0,0,0.6)`;
    });

    marker.on("dragend", async () => {
      el.style.cursor = "grab";
      el.style.boxShadow = `0 0 12px ${markerColor}99, 0 4px 10px rgba(0,0,0,0.5)`;
      const lngLat = marker.getLngLat();
      const newLat = Number(lngLat.lat.toFixed(6));
      const newLon = Number(lngLat.lng.toFixed(6));

      wp.lat = newLat;
      wp.lon = newLon;

      // Quick reverse-geocode to update location label if generic
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${newLat}&lon=${newLon}&format=json`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.display_name) {
            const shortName = data.display_name.split(",")[0].toUpperCase();
            if (shortName) wp.title = shortName;
          }
        }
      } catch (e) {}

      renderWaypointsUI();
      renderWaypointMapMarkers();
      updateExpeditionRoute();
      showToast(`Moved "${wp.title || 'Waypoint'}" to [${newLat.toFixed(4)}, ${newLon.toFixed(4)}] & recalculating route 📍`);
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

interface DayGroup {
  dayIndex: number;
  dayTitle: string;
  waypoints: { wp: Waypoint; globalIdx: number }[];
  totalDistMi: number;
  totalDurationSec: number;
}

function groupWaypointsByDay(waypointsList: Waypoint[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let currentDayIdx = 0;
  let currentGroup: DayGroup = {
    dayIndex: 0,
    dayTitle: "DAY 1",
    waypoints: [],
    totalDistMi: 0,
    totalDurationSec: 0
  };

  waypointsList.forEach((wp, idx) => {
    if (idx > 0 && waypointsList[idx - 1].isOvernight) {
      groups.push(currentGroup);
      currentDayIdx++;
      currentGroup = {
        dayIndex: currentDayIdx,
        dayTitle: `DAY ${currentDayIdx + 1}`,
        waypoints: [],
        totalDistMi: 0,
        totalDurationSec: 0
      };
    }

    if (idx > 0) {
      const legMetric = currentLegMetrics[idx - 1];
      if (legMetric) {
        currentGroup.totalDistMi += legMetric.distanceMi;
        currentGroup.totalDurationSec += legMetric.durationSec;
      }
    }

    currentGroup.waypoints.push({ wp, globalIdx: idx });
  });

  groups.push(currentGroup);
  return groups;
}

function fitMapToDayBounds(dayIndex: number) {
  if (!map) return;
  const dayGroups = groupWaypointsByDay(waypoints);
  const targetDay = dayGroups.find((d) => d.dayIndex === dayIndex);
  if (!targetDay || targetDay.waypoints.length === 0) return;

  const valid = targetDay.waypoints
    .map(({ wp }) => wp)
    .filter((w) => w.lat !== null && w.lon !== null);

  if (valid.length === 0) return;

  if (valid.length === 1) {
    map.flyTo({ center: [valid[0].lon!, valid[0].lat!], zoom: 13, duration: 800 });
    return;
  }

  const bounds = new maplibregl.LngLatBounds();
  valid.forEach((w) => bounds.extend([w.lon!, w.lat!]));

  map.fitBounds(bounds, {
    padding: { top: 80, bottom: 80, left: 380, right: 80 },
    maxZoom: 14,
    duration: 900
  });
}

// Render Left Panel Waypoints List UI grouped by Collapsible Day Accordions
function renderWaypointsUI() {
  if (!waypointsContainer) return;

  const fragment = document.createDocumentFragment();

  // Ensure waypoint types are assigned correctly by array order
  waypoints.forEach((w, i) => {
    if (i === 0) w.type = "origin";
    else if (i === waypoints.length - 1) w.type = "destination";
    else w.type = "stop";
  });

  const dayGroups = groupWaypointsByDay(waypoints);

  dayGroups.forEach((group) => {
    const dayColor = getDayColor(group.dayIndex);
    const isCollapsed = collapsedDays.has(group.dayIndex);

    const dayCardEl = document.createElement("div");
    dayCardEl.className = `day-accordion-card ${isCollapsed ? "collapsed" : ""}`;

    const stopsCountText = `${group.waypoints.length} Stop${group.waypoints.length > 1 ? "s" : ""}`;
    const distText = group.totalDistMi > 0 ? `${group.totalDistMi.toFixed(1)} MI` : "";
    const timeText = group.totalDurationSec > 0 ? formatDuration(group.totalDurationSec) : "";
    const subtitleText = [stopsCountText, distText, timeText].filter(Boolean).join(" • ");

    const dayHeaderEl = document.createElement("div");
    dayHeaderEl.className = "day-accordion-header";
    dayHeaderEl.innerHTML = `
      <div class="day-accordion-left">
        <span class="day-color-indicator" style="background-color: ${dayColor}; color: ${dayColor};"></span>
        <div class="day-accordion-title-box">
          <span class="day-accordion-title">${group.dayTitle}</span>
          <span class="day-accordion-subtitle">${subtitleText}</span>
        </div>
      </div>
      <div class="day-accordion-right">
        <span class="day-accordion-badge">${stopsCountText}</span>
        <span class="day-accordion-chevron">▼</span>
      </div>
    `;

    dayHeaderEl.addEventListener("click", () => {
      if (collapsedDays.has(group.dayIndex)) {
        collapsedDays.delete(group.dayIndex);
      } else {
        collapsedDays.add(group.dayIndex);
      }
      fitMapToDayBounds(group.dayIndex);
      renderWaypointsUI();
    });

    dayCardEl.appendChild(dayHeaderEl);

    const dayBodyEl = document.createElement("div");
    dayBodyEl.className = "day-accordion-body";

    group.waypoints.forEach(({ wp, globalIdx }) => {
      if (globalIdx > 0) {
        const legIndex = globalIdx - 1;
        const legMetric = currentLegMetrics[legIndex];
        const legText = legMetric 
          ? `↓ ${legMetric.distanceMi.toFixed(1)} MI • ${formatDuration(legMetric.durationSec)}`
          : `↓ ENTER WAYPOINTS...`;

        const legEl = document.createElement("div");
        legEl.className = "leg-connector";
        legEl.innerHTML = `
          <span class="leg-line"></span>
          <span id="leg-badge-${legIndex}" class="leg-badge">${legText}</span>
          <button class="btn-add-inline-leg" data-insert-index="${globalIdx}" title="Insert Stop Here">+</button>
        `;
        dayBodyEl.appendChild(legEl);
      }

      const currentCat = getCategoryForWaypoint(wp);
      const catDetails = CATEGORY_DETAILS[currentCat];

      if (isCompactView) {
        // Render 1-Line Compact View Row
        const compactRowEl = document.createElement("div");
        compactRowEl.className = "compact-waypoint-row";
        compactRowEl.setAttribute("data-index", globalIdx.toString());
        compactRowEl.setAttribute("data-wp-id", wp.id);

        let stopNumStr = `#${globalIdx + 1}`;
        if (wp.type === "origin") stopNumStr = "A";
        else if (wp.type === "destination") stopNumStr = "B";

        compactRowEl.innerHTML = `
          <div class="compact-row-left">
            <span class="compact-stop-num">${stopNumStr}</span>
            <span class="compact-stop-icon">${catDetails ? catDetails.icon : "📍"}</span>
            <span class="compact-stop-title">${wp.title || `Stop #${globalIdx + 1}`}</span>
          </div>
          <div class="compact-row-right">
            <span class="compact-stop-time" id="wp-arr-${wp.id}">ARR: --:--</span>
            ${waypoints.length > 2 ? `<button class="btn-remove-waypoint" data-id="${wp.id}" title="Remove Stop" style="padding:0 4px; border:none; background:none; color:var(--text-muted); cursor:pointer;">✕</button>` : ""}
          </div>
        `;

        compactRowEl.addEventListener("click", (e) => {
          const target = e.target as HTMLElement;
          if (target.classList.contains("btn-remove-waypoint") || target.classList.contains("btn-add-inline-leg")) {
            return;
          }
          focusOnWaypoint(wp.id);
        });

        dayBodyEl.appendChild(compactRowEl);
      } else {
        // Render Detailed Card View Item
        const itemEl = document.createElement("div");
        itemEl.className = "waypoint-item";
        itemEl.setAttribute("draggable", "true");
        itemEl.setAttribute("data-index", globalIdx.toString());
        itemEl.setAttribute("data-wp-id", wp.id);

        let tagClass = "tag-stop";
        let titlePlaceholder = `Stop #${globalIdx + 1} Title`;

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
          <div class="wp-card-gutter drag-handle ${tagClass}" title="Drag to reorder waypoint sequence">
            <span class="wp-gutter-grip">⋮</span>
            <span class="wp-gutter-num">#${globalIdx + 1}</span>
            <span class="wp-gutter-grip">⋮</span>
          </div>

          <div class="wp-card-body">
            <div class="wp-card-line1">
              <input 
                type="text" 
                id="input-title-${wp.id}"
                name="waypoint_title_${wp.id}"
                class="waypoint-name-input" 
                data-id="${wp.id}" 
                data-field="title"
                value="${wp.title}" 
                placeholder="${titlePlaceholder}" 
              />
              ${waypoints.length > 2 ? `<button class="btn-remove-waypoint" data-id="${wp.id}" title="Remove Stop">✕</button>` : ""}
            </div>

            <div class="wp-card-line2">
              <span class="wp-meta-arr" id="wp-arr-${wp.id}">ARR: --:--</span>
              <span class="wp-meta-sep">|</span>
              <input 
                type="text" 
                id="input-coords-${wp.id}"
                name="waypoint_coords_${wp.id}"
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

        itemEl.addEventListener("click", (e) => {
          const target = e.target as HTMLElement;
          if (target.classList.contains("btn-remove-waypoint") || target.classList.contains("btn-add-inline-leg")) {
            return;
          }
          focusOnWaypoint(wp.id);
        });

        itemEl.addEventListener("dragstart", (e) => {
          draggedWaypointIndex = globalIdx;
          itemEl.classList.add("dragging");
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", globalIdx.toString());
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
          const targetIndex = globalIdx;

          if (draggedWaypointIndex !== null && draggedWaypointIndex !== targetIndex) {
            const [movedWp] = waypoints.splice(draggedWaypointIndex, 1);
            waypoints.splice(targetIndex, 0, movedWp);

            renderWaypointsUI();
            renderWaypointMapMarkers();
            updateExpeditionRoute();
          }
        });

        dayBodyEl.appendChild(itemEl);
      }
    });

    dayCardEl.appendChild(dayBodyEl);
    fragment.appendChild(dayCardEl);
  });

  const addEndContainer = document.createElement("div");
  addEndContainer.className = "add-end-stop-container";
  addEndContainer.innerHTML = `
    <button id="add-end-stop-btn" class="btn-add-end-stop">+ ADD STOP</button>
  `;
  fragment.appendChild(addEndContainer);

  waypointsContainer.innerHTML = "";
  waypointsContainer.appendChild(fragment);

  renderWaypointMapMarkers();
  updateWaypointCardTiming();
  saveActiveDraftToLocalStorage();
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

// Helper to insert a new stop at the end of the list and set it as the new Destination/End Point
function insertNewEndStopAt(lat?: number, lon?: number) {
  let targetLat: number | null = lat !== undefined ? lat : null;
  let targetLon: number | null = lon !== undefined ? lon : null;

  // 1. If Origin (waypoints[0]) is blank, populate Origin first
  if (waypoints.length > 0 && waypoints[0].lat === null) {
    waypoints[0].lat = targetLat;
    waypoints[0].lon = targetLon;
    renderWaypointsUI();
    renderWaypointMapMarkers();
    updateExpeditionRoute();
    if (targetLat !== null && targetLon !== null) focusOnWaypoint(waypoints[0].id);
    return;
  }

  // 2. Convert existing Destination to intermediate stop
  waypoints.forEach((w) => {
    if (w.type === "destination") {
      w.type = "stop";
    }
  });

  // 3. Append new End Point at the end of array
  const newEndStop: Waypoint = {
    id: `wp-dest-${Date.now()}`,
    title: "",
    lat: targetLat,
    lon: targetLon,
    type: "destination"
  };

  waypoints.push(newEndStop);
  renderWaypointsUI();
  renderWaypointMapMarkers();
  updateExpeditionRoute();

  if (targetLat !== null && targetLon !== null) {
    focusOnWaypoint(newEndStop.id);
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

    // End Add Button (Appends new stop at end of list & sets as new Destination)
    if (target.id === "add-end-stop-btn" || target.classList.contains("btn-add-end-stop")) {
      insertNewEndStopAt();
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

  // Auto-Geocode Waypoint Title on Enter Key or Focus Out
  waypointsContainer.addEventListener("keydown", (e) => {
    const target = e.target as HTMLInputElement;
    if (e.key === "Enter" && target && target.classList.contains("waypoint-name-input")) {
      target.blur();
    }
  });

  waypointsContainer.addEventListener("focusout", (e) => {
    const target = e.target as HTMLInputElement;
    if (!target || !target.classList.contains("waypoint-name-input")) return;

    const id = target.dataset.id;
    if (!id) return;

    const wp = waypoints.find((w) => w.id === id);
    if (wp) {
      geocodeWaypointIfNeeded(wp, true);
    }
  });
}

// Auto-Geocode Waypoint Title when user finishes typing (Blur or Enter key)
async function geocodeWaypointIfNeeded(wp: Waypoint, forceGeocode: boolean = false) {
  const query = wp.title.trim();
  if (!query) return;

  // If user typed coordinates directly into title (e.g. "40.9, -98.3")
  const parts = query.split(/[\s,]+/).filter(Boolean);
  if (parts.length === 2) {
    const pLat = parseFloat(parts[0]);
    const pLon = parseFloat(parts[1]);
    if (!isNaN(pLat) && !isNaN(pLon) && Math.abs(pLat) <= 90 && Math.abs(pLon) <= 180) {
      wp.lat = pLat;
      wp.lon = pLon;
      renderWaypointsUI();
      renderWaypointMapMarkers();
      updateExpeditionRoute();
      return;
    }
  }

  // If lat/lon are missing OR if title was updated (forceGeocode = true), geocode via Nominatim API
  if (forceGeocode || wp.lat === null || wp.lon === null) {
    try {
      showToast(`Finding location for "${query}"... 🔍`);
      const center = map ? map.getCenter() : { lng: -104.9903, lat: 39.7392 };
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&lat=${center.lat}&lon=${center.lng}`
      );
      if (res.ok) {
        const results = await res.json();
        if (results && results.length > 0) {
          const lat = parseFloat(results[0].lat);
          const lon = parseFloat(results[0].lon);
          wp.lat = lat;
          wp.lon = lon;
          if (results[0].display_name) {
            wp.title = results[0].display_name.split(",")[0].toUpperCase();
          }
          renderWaypointsUI();
          renderWaypointMapMarkers();
          updateExpeditionRoute();
          focusOnWaypoint(wp.id);
          showToast(`Set "${wp.title}" to [${lat.toFixed(4)}, ${lon.toFixed(4)}] & recalculating route 📍`);
          return;
        }
      }
    } catch (err) {
      console.warn("Geocoding failed for waypoint title:", query, err);
    }
  }
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

// Left Panel Accordions & Compact View Mode Toolbar Listeners
if (toggleViewModeBtn) {
  toggleViewModeBtn.addEventListener("click", () => {
    isCompactView = !isCompactView;
    toggleViewModeBtn.classList.toggle("active", isCompactView);
    toggleViewModeBtn.innerHTML = isCompactView ? "📄 Detailed" : "☰ Compact";
    renderWaypointsUI();
  });
}

if (toggleAllAccordionsBtn) {
  toggleAllAccordionsBtn.addEventListener("click", () => {
    isAllAccordionsCollapsed = !isAllAccordionsCollapsed;
    const dayGroups = groupWaypointsByDay(waypoints);
    if (isAllAccordionsCollapsed) {
      dayGroups.forEach((g) => collapsedDays.add(g.dayIndex));
      toggleAllAccordionsBtn.innerHTML = "▲ Accordions";
    } else {
      collapsedDays.clear();
      toggleAllAccordionsBtn.innerHTML = "▼ Accordions";
    }
    renderWaypointsUI();
  });
}

// 3D Expedition Terrain & Flythrough Viewer Controls
export function open3DViewerModal() {
  if (!modal3DViewer) return;
  modal3DViewer.style.display = "flex";

  const container = document.getElementById("map-3d-container");
  if (!container) return;

  if (!map3D) {
    console.log("Initializing Dedicated 3D Terrain Command Surface...");
    map3D = new maplibregl.Map({
      container: "map-3d-container",
      style: {
        version: 8,
        sources: {
          "esri-satellite": {
            type: "raster",
            tiles: [
              "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            ],
            tileSize: 256,
            maxzoom: 17,
            attribution: "© Esri, Maxar, Earthstar Geographics"
          },
          "terrarium-dem": {
            type: "raster-dem",
            tiles: [
              "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
            ],
            encoding: "terrarium",
            tileSize: 256,
            maxzoom: 15
          }
        },
        layers: [
          { id: "esri-satellite-layer", type: "raster", source: "esri-satellite", minzoom: 0, maxzoom: 17 }
        ],
        terrain: {
          source: "terrarium-dem",
          exaggeration: 1.8
        }
      },
      center: DEFAULT_CENTER,
      zoom: 12.5,
      pitch: 65,
      bearing: -25,
      attributionControl: false
    });

    map3D.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "bottom-right");
    map3D.addControl(new maplibregl.FullscreenControl(), "bottom-right");

    map3D.on("pitch", () => {
      if (hudPitchVal && map3D) {
        hudPitchVal.textContent = `${Math.round(map3D.getPitch())}°`;
      }
    });
  }

  setTimeout(() => {
    if (!map3D) return;
    map3D.resize();

    // Render active expedition route on 3D map surface
    if (map3D.getSource("route-3d")) {
      (map3D.getSource("route-3d") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: lastRouteCoordinates.length > 1 ? lastRouteCoordinates : []
            }
          }
        ]
      });
    } else {
      map3D.addSource("route-3d", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: lastRouteCoordinates.length > 1 ? lastRouteCoordinates : []
              }
            }
          ]
        }
      });

      map3D.addLayer({
        id: "route-3d-glow",
        type: "line",
        source: "route-3d",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#38bdf8", "line-width": 8, "line-opacity": 0.4 }
      });

      map3D.addLayer({
        id: "route-3d-line",
        type: "line",
        source: "route-3d",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#ef4444", "line-width": 4 }
      });
    }

    if (lastRouteCoordinates.length > 1) {
      const bounds = new maplibregl.LngLatBounds(lastRouteCoordinates[0], lastRouteCoordinates[0]);
      lastRouteCoordinates.forEach((coord) => bounds.extend(coord));
      map3D.fitBounds(bounds, { padding: 80, pitch: 60, duration: 1000 });
    }
  }, 120);
}

function close3DViewerModal() {
  if (modal3DViewer) modal3DViewer.style.display = "none";
  stop3DFlythrough();
}

function stop3DFlythrough() {
  is3DFlying = false;
  if (flythroughTimer) clearTimeout(flythroughTimer);
  if (btn3DFlythrough) btn3DFlythrough.innerHTML = "▶ Play Route Flythrough";
  if (hudFlyStatus) hudFlyStatus.textContent = "PAUSED";
}

function reset3DCamera() {
  stop3DFlythrough();
  if (!map3D) return;

  if (lastRouteCoordinates.length > 1) {
    const bounds = new maplibregl.LngLatBounds(lastRouteCoordinates[0], lastRouteCoordinates[0]);
    lastRouteCoordinates.forEach((coord) => bounds.extend(coord));
    map3D.fitBounds(bounds, { padding: 80, pitch: 65, duration: 1000 });
  } else {
    map3D.easeTo({ pitch: 65, bearing: -25, zoom: 12.5, duration: 1000 });
  }
}

function toggle3DFlythrough() {
  if (is3DFlying) {
    stop3DFlythrough();
    return;
  }

  if (!lastRouteCoordinates || lastRouteCoordinates.length < 2) {
    showToast("Please add at least 2 waypoints to run 3D flythrough.");
    return;
  }

  is3DFlying = true;
  if (btn3DFlythrough) btn3DFlythrough.innerHTML = "⏸ Pause Flythrough";
  if (hudFlyStatus) hudFlyStatus.textContent = "FLYING...";

  const stepInterval = Math.max(1, Math.floor(lastRouteCoordinates.length / 35));
  flythroughIndex = 0;

  function stepFlythrough() {
    if (!is3DFlying || !map3D) return;

    if (flythroughIndex >= lastRouteCoordinates.length) {
      stop3DFlythrough();
      if (hudFlyStatus) hudFlyStatus.textContent = "COMPLETED 🏁";
      showToast("3D Route Flythrough completed!");
      return;
    }

    const currentCoord = lastRouteCoordinates[flythroughIndex];
    const nextIndex = Math.min(flythroughIndex + stepInterval, lastRouteCoordinates.length - 1);
    const nextCoord = lastRouteCoordinates[nextIndex];

    const dx = nextCoord[0] - currentCoord[0];
    const dy = nextCoord[1] - currentCoord[1];
    const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;

    map3D.flyTo({
      center: currentCoord,
      zoom: 14.5,
      pitch: 68,
      bearing: bearing,
      speed: 0.8,
      curve: 1.2,
      essential: true
    });

    const progressPct = Math.round((flythroughIndex / lastRouteCoordinates.length) * 100);
    if (hudFlyStatus) hudFlyStatus.textContent = `FLYING (${progressPct}%)`;

    flythroughIndex += stepInterval;
    flythroughTimer = setTimeout(stepFlythrough, 2500);
  }

  stepFlythrough();
}

if (modal3DClose) modal3DClose.addEventListener("click", close3DViewerModal);
if (btn3DFlythrough) btn3DFlythrough.addEventListener("click", toggle3DFlythrough);
if (btn3DResetCam) btn3DResetCam.addEventListener("click", reset3DCamera);

// Tactical Document ID Generator: IV-YEAR-JULIANDAY-ROMAN
let lastManifestJulianDay = "";
let manifestDailyCounter = 0;

function getJulianDayNumber(d: Date): string {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = (d.getTime() - start.getTime()) + ((start.getTimezoneOffset() - d.getTimezoneOffset()) * 60 * 1000);
  const oneDay = 1000 * 60 * 60 * 24;
  const day = Math.floor(diff / oneDay);
  return day.toString().padStart(3, "0");
}

function toRomanNumeral(num: number): string {
  const val = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syb = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
  let roman = "";
  let n = num;
  for (let i = 0; i < val.length; i++) {
    while (n >= val[i]) {
      roman += syb[i];
      n -= val[i];
    }
  }
  return roman || "I";
}

function generateTacticalDocId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const julian = getJulianDayNumber(now);

  if (julian !== lastManifestJulianDay) {
    lastManifestJulianDay = julian;
    manifestDailyCounter = 1;
  } else {
    manifestDailyCounter++;
  }

  const roman = toRomanNumeral(manifestDailyCounter);
  return `IV-${year}-${julian}-${roman}`;
}

// Render Clean Monochrome Print Manifest Document (Dynamic Multi-Page Chunking & Alternating Shaded Rows)
function renderPrintManifest() {
  const container = document.getElementById("print-manifest-container");
  if (!container) return;

  const now = new Date();
  const docId = generateTacticalDocId();
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

  let validIdx = 0;

  waypoints.forEach((wp, idx) => {
    const isPlaced = wp.lat !== null && wp.lon !== null;
    let legMetric: LegMetric | undefined = undefined;

    if (isPlaced) {
      if (validIdx > 0) {
        legMetric = currentLegMetrics[validIdx - 1];
      }
      validIdx++;
    }

    const category = getCategoryForWaypoint(wp);
    const catDetail = CATEGORY_DETAILS[category];
    const categoryText = catDetail ? catDetail.label.toUpperCase() : "GENERAL";

    let arrTime = "START";
    let depTime = "--:--";

    if (idx > 0) {
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

    const legDist = idx > 0 && legMetric 
      ? `${legMetric.distanceMi.toFixed(1)} MI` 
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
          <div class="print-form-field" style="grid-column: span 2; height: 480px; max-height: 480px; overflow: hidden; display: flex; flex-direction: column;">
            <span class="print-field-label">EXPEDITION SUMMARY & BRIEFING</span>
            <span class="print-field-value" style="font-weight: 500; font-size: 0.82rem; line-height: 1.4; white-space: pre-wrap; display: block; overflow: hidden; max-height: 450px;">${currentTripSummary || "No special briefing notes specified."}</span>
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

  // Fill blank Checkbook Register Rows so Section 5 fills the page cleanly
  const targetCheckRows = Math.max(8, 12 - bRowIndex);
  for (let b = 1; b <= targetCheckRows; b++) {
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
      <title></title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&family=JetBrains+Mono:wght@500;700;800&display=swap" rel="stylesheet">
      <style>
        @page { size: letter portrait; margin: 0.25in !important; }
        * { box-sizing: border-box; }
        body {
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          background: #ffffff;
          color: #0f172a;
          margin: 0;
          padding: 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .print-form-card {
          width: 100% !important;
          max-width: 100% !important;
          height: 10.5in !important;
          min-height: 10.5in !important;
          max-height: 10.5in !important;
          margin: 0 auto !important;
          padding: 0.3in !important;
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
        .print-form-footer { display: flex; justify-content: space-between; font-family: 'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 6px; margin-top: auto !important; }
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

if (toggleAllItineraryDaysBtn) {
  toggleAllItineraryDaysBtn.addEventListener("click", () => {
    let totalDays = 1;
    waypoints.forEach((_, idx) => {
      if (idx > 0 && waypoints[idx - 1].isOvernight) {
        totalDays++;
      }
    });

    if (collapsedItineraryDays.size >= totalDays) {
      collapsedItineraryDays.clear();
    } else {
      for (let d = 1; d <= totalDays; d++) {
        collapsedItineraryDays.add(d);
      }
    }
    renderItinerarySpreadsheet();
  });
}

// Live Table Inputs & Toggles Event Delegation
if (itineraryTableBody) {
  itineraryTableBody.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    // Day Header Accordion Row Toggle
    const dayHeaderRow = target.closest(".day-header-row") as HTMLTableRowElement;
    if (dayHeaderRow && dayHeaderRow.dataset.dayNum) {
      const dayNum = parseInt(dayHeaderRow.dataset.dayNum, 10);
      if (collapsedItineraryDays.has(dayNum)) {
        collapsedItineraryDays.delete(dayNum);
      } else {
        collapsedItineraryDays.add(dayNum);
      }
      renderItinerarySpreadsheet();
      return;
    }

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

// Initialize a New Blank Expedition Workspace
function resetTripToNewWorkspace() {
  if (waypoints.some((w) => w.lat !== null && w.lon !== null)) {
    const confirmReset = confirm("Create a new blank expedition? Any unsaved changes on your active trip will be cleared.");
    if (!confirmReset) return;
  }

  currentTripId = null;
  currentFileHandle = null;
  currentTripTitle = "MY EXPEDITION ROUTE";
  currentTripSummary = "";
  lastRouteCoordinates = [];
  currentLegMetrics = [];
  currentRouteLegs = [];
  collapsedDays.clear();

  try {
    localStorage.removeItem("iterviae_v2_active_draft");
  } catch (e) {}

  if (modalTripTitle) modalTripTitle.value = currentTripTitle;
  if (modalTripSummary) modalTripSummary.value = "";
  if (tripTitleText) tripTitleText.textContent = currentTripTitle;

  waypoints = [
    { id: "wp-origin", title: "", lat: null, lon: null, type: "origin" },
    { id: "wp-dest", title: "", lat: null, lon: null, type: "destination" }
  ];

  renderWaypointsUI();
  renderWaypointMapMarkers();

  if (map) {
    if (map.getLayer("expedition-route-layer")) map.removeLayer("expedition-route-layer");
    if (map.getLayer("expedition-route-casing")) map.removeLayer("expedition-route-casing");
    if (map.getSource("expedition-route-src")) map.removeSource("expedition-route-src");
    if (map.getLayer("expedition-empty-route-layer")) map.removeLayer("expedition-empty-route-layer");
    if (map.getSource("expedition-empty-route-src")) map.removeSource("expedition-empty-route-src");
  }

  if (metricDistance) metricDistance.textContent = "0.0 MI";
  if (metricDuration) metricDuration.textContent = "0H 0M";

  updateFuelCalculations();
  showToast("New expedition workspace initialized ➕");
}

if (newTripBtn) newTripBtn.addEventListener("click", resetTripToNewWorkspace);

// Export Expedition Route as Standard GPX 1.1 XML File (Garmin / GPS Compatible)
function exportExpeditionToGPX() {
  const validWaypoints = waypoints.filter((w) => w.lat !== null && w.lon !== null);
  if (validWaypoints.length === 0) {
    alert("No valid waypoints to export. Please add waypoints to your expedition route first.");
    return;
  }

  const sanitizedTitle = currentTripTitle.replace(/[^\w\s-]/gi, "").trim() || "Expedition_Route";
  const now = new Date().toISOString();

  let gpxXml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  gpxXml += `<gpx version="1.1" creator="Iter Viae - https://iterviae.com" xmlns="http://www.topografix.com/GPX/1/1">\n`;
  gpxXml += `  <metadata>\n`;
  gpxXml += `    <name>${escapeXml(currentTripTitle)}</name>\n`;
  gpxXml += `    <desc>${escapeXml(currentTripSummary || "Expedition Route generated via Iter Viae")}</desc>\n`;
  gpxXml += `    <time>${now}</time>\n`;
  gpxXml += `  </metadata>\n`;

  // Waypoint Stops (<wpt>)
  validWaypoints.forEach((wp, idx) => {
    let name = wp.title || `Stop #${idx + 1}`;
    if (idx === 0) name = `[START] ${name}`;
    else if (idx === validWaypoints.length - 1) name = `[END] ${name}`;

    gpxXml += `  <wpt lat="${wp.lat!.toFixed(6)}" lon="${wp.lon!.toFixed(6)}">\n`;
    gpxXml += `    <name>${escapeXml(name)}</name>\n`;
    gpxXml += `    <sym>${wp.isOvernight ? "Hotel" : "Pin"}</sym>\n`;
    gpxXml += `    <type>${getCategoryForWaypoint(wp)}</type>\n`;
    gpxXml += `  </wpt>\n`;
  });

  // Track Polyline Geometry (<trk>)
  if (lastRouteCoordinates && lastRouteCoordinates.length > 1) {
    gpxXml += `  <trk>\n`;
    gpxXml += `    <name>${escapeXml(currentTripTitle)} Track</name>\n`;
    gpxXml += `    <trkseg>\n`;
    lastRouteCoordinates.forEach(([lon, lat]) => {
      gpxXml += `      <trkpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"/>\n`;
    });
    gpxXml += `    </trkseg>\n`;
    gpxXml += `  </trk>\n`;
  }

  gpxXml += `</gpx>`;

  const blob = new Blob([gpxXml], { type: "application/gpx+xml;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizedTitle.replace(/\s+/g, "_")}.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Exported ${sanitizedTitle}.gpx for GPS devices 📥`);
}

// Export Trip as Local .iterviae JSON File directly to user disk (Zero Server Needed)
async function exportLocalTripFile() {
  const validWaypoints = waypoints.filter((w) => w.lat !== null && w.lon !== null);
  if (validWaypoints.length === 0) {
    alert("No valid waypoints to save. Please add waypoints to your expedition route first.");
    return;
  }

  const sanitizedTitle = currentTripTitle.replace(/[^\w\s-]/gi, "").trim() || "Expedition_Route";
  const defaultFilename = `${sanitizedTitle.replace(/\s+/g, "_")}.iterviae`;
  const encodedPolyline = encodePolyline6(lastRouteCoordinates);
  const compactLegs = currentRouteLegs.map((leg) => ({
    startLat: Number(leg.startLat.toFixed(5)),
    startLon: Number(leg.startLon.toFixed(5)),
    endLat: Number(leg.endLat.toFixed(5)),
    endLon: Number(leg.endLon.toFixed(5)),
    encodedPolyline: leg.encodedPolyline || (leg.coordinates ? encodePolyline6(leg.coordinates) : ""),
    distanceMi: Number(leg.distanceMi.toFixed(2)),
    durationSec: Math.round(leg.durationSec)
  }));

  updateFuelCalculations(); // Ensure vehicleProfile matches current DOM inputs

  const fileData = {
    version: "2.0",
    generator: "Iter Viae - https://iterviae.com",
    created: new Date().toISOString(),
    tripId: currentTripId,
    title: currentTripTitle,
    summary: currentTripSummary,
    waypoints: waypoints,
    expeditionStartTime: expeditionStartTime,
    vehicleProfile: vehicleProfile,
    encodedPolyline: encodedPolyline,
    legs: currentLegMetrics,
    routeLegs: compactLegs
  };

  const jsonStr = JSON.stringify(fileData, null, 2);

  // Modern File System Access API: Enables direct file overwrite without duplicate files
  if ("showSaveFilePicker" in window) {
    try {
      if (!currentFileHandle) {
        currentFileHandle = await (window as any).showSaveFilePicker({
          suggestedName: defaultFilename,
          types: [
            {
              description: "Iter Viae Expedition File",
              accept: { "application/json": [".iterviae", ".json"] }
            }
          ]
        });
      }

      const writable = await currentFileHandle.createWritable();
      await writable.write(jsonStr);
      await writable.close();

      const fileName = currentFileHandle.name || defaultFilename;
      showToast(`Overwrote ${fileName} on local disk 💾`);
      return;
    } catch (err: any) {
      if (err.name === "AbortError") return; // User cancelled file picker
      // Fall through to fallback download if permission denied
    }
  }

  // Classic Browser Fallback Download
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Saved ${defaultFilename} to local disk 💾`);
}

// Load Trip directly from a Local .iterviae or .json File
function loadLocalTripFile(file: File) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string;
      const data = JSON.parse(content);

      if (!data || !Array.isArray(data.waypoints) || data.waypoints.length === 0) {
        alert("Invalid Iter Viae trip file format.");
        return;
      }

      currentTripId = data.tripId || null;
      currentTripTitle = (data.title || "MY EXPEDITION ROUTE").toUpperCase();
      currentTripSummary = data.summary || "";
      waypoints = data.waypoints;

      if (data.expeditionStartTime) expeditionStartTime = data.expeditionStartTime;
      if (data.vehicleProfile) syncVehicleProfileToUI(data.vehicleProfile);

      if (data.encodedPolyline) {
        lastRouteCoordinates = decodePolyline6(data.encodedPolyline);
      } else if (Array.isArray(data.coordinates)) {
        lastRouteCoordinates = data.coordinates;
      }

      if (Array.isArray(data.legs)) currentLegMetrics = data.legs;
      if (Array.isArray(data.routeLegs)) currentRouteLegs = data.routeLegs;

      if (tripTitleText) tripTitleText.textContent = currentTripTitle;
      if (modalTripTitle) modalTripTitle.value = currentTripTitle;
      if (modalTripSummary) modalTripSummary.value = currentTripSummary;

      saveActiveDraftToLocalStorage();
      renderWaypointsUI();
      renderWaypointMapMarkers();
      redrawRouteLine();
      updateLegBadgesUI();
      fitMapToAllWaypoints();

      // Automatically re-query road engine to upgrade any legacy straight lines
      updateExpeditionRoute(true);

      showToast(`Loaded Local Trip "${currentTripTitle}" 📂`);
    } catch (err: any) {
      console.error("Error reading local trip file:", err);
      alert("Failed to parse local trip file: " + err.message);
    }
  };
  reader.readAsText(file);
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Import GPX / KML Waypoints File into Active Workspace
function parseGPXorKMLText(text: string, filename: string) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");
  const importedWaypoints: Waypoint[] = [];

  if (filename.toLowerCase().endsWith(".kml") || text.includes("<kml")) {
    const placemarks = xmlDoc.getElementsByTagName("Placemark");
    for (let i = 0; i < placemarks.length; i++) {
      const pm = placemarks[i];
      const name = pm.getElementsByTagName("name")[0]?.textContent || `Stop #${i + 1}`;
      const coordsText = pm.getElementsByTagName("coordinates")[0]?.textContent;
      if (coordsText) {
        const parts = coordsText.trim().split(",");
        if (parts.length >= 2) {
          const lon = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lon)) {
            importedWaypoints.push({
              id: `wp-${Date.now()}-${i}`,
              title: name.trim(),
              lat,
              lon,
              type: i === 0 ? "origin" : "stop"
            });
          }
        }
      }
    }
  } else {
    const wpts = xmlDoc.getElementsByTagName("wpt");
    for (let i = 0; i < wpts.length; i++) {
      const wpt = wpts[i];
      const lat = parseFloat(wpt.getAttribute("lat") || "");
      const lon = parseFloat(wpt.getAttribute("lon") || "");
      const name = wpt.getElementsByTagName("name")[0]?.textContent || `Stop #${i + 1}`;
      if (!isNaN(lat) && !isNaN(lon)) {
        importedWaypoints.push({
          id: `wp-${Date.now()}-${i}`,
          title: name.trim(),
          lat,
          lon,
          type: i === 0 ? "origin" : "stop"
        });
      }
    }
  }

  if (importedWaypoints.length === 0) {
    alert("No valid waypoint coordinates found in the uploaded GPX/KML file.");
    return;
  }

  if (importedWaypoints.length > 0) {
    importedWaypoints[importedWaypoints.length - 1].type = "destination";
  }

  waypoints = importedWaypoints;
  currentTripTitle = filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ").toUpperCase();
  if (tripTitleText) tripTitleText.textContent = currentTripTitle;
  if (modalTripTitle) modalTripTitle.value = currentTripTitle;

  renderWaypointsUI();
  renderWaypointMapMarkers();
  updateExpeditionRoute();

  showToast(`Imported ${importedWaypoints.length} waypoints from ${filename} 📤`);
}

if (exportGPXBtn) exportGPXBtn.addEventListener("click", exportExpeditionToGPX);

if (importGPXBtn && importGPXInput) {
  importGPXBtn.addEventListener("click", () => {
    importGPXInput.click();
  });

  importGPXInput.addEventListener("change", (e) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      const file = target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        if (text) parseGPXorKMLText(text, file.name);
      };
      reader.readAsText(file);
    }
  });
}

// Interactive POI & Place Search Engine (Keyless Nominatim OpenStreetMap Endpoint)
interface POISearchResult {
  title: string;
  category: StopCategory;
  lat: number;
  lon: number;
  address?: string;
}

const CATEGORY_SEARCH_MAPPING: Record<string, { query: string; category: StopCategory; label: string; icon: string }> = {
  gas: { query: "gas station", category: "gas", label: "Gas Station", icon: "⛽" },
  camping: { query: "campground", category: "attraction", label: "Camping", icon: "🏕️" },
  sightseeing: { query: "scenic viewpoint attraction", category: "attraction", label: "Sightseeing", icon: "⛰️" },
  food: { query: "restaurant diner", category: "restaurant", label: "Food & Dining", icon: "🍽️" },
  lodging: { query: "hotel motel", category: "lodging", label: "Hotel / Lodging", icon: "🏨" }
};

function clearSearchPOIMarkers() {
  activePoiSearchMarkers.forEach((m) => m.remove());
  activePoiSearchMarkers = [];
}

async function executePOISearchAroundPoint(catKey: string, customPoint?: { lat: number; lng: number }) {
  clearSearchPOIMarkers();

  const config = CATEGORY_SEARCH_MAPPING[catKey] || {
    query: catKey,
    category: "general" as StopCategory,
    label: catKey,
    icon: "📍"
  };

  const centerPoint = customPoint || lastRightClickLngLat || (map ? { lat: map.getCenter().lat, lng: map.getCenter().lng } : null);
  if (!centerPoint) return;

  if (poiResultsPanel) poiResultsPanel.style.display = "flex";
  if (poiPanelTitle) poiPanelTitle.textContent = `${config.icon} NEARBY ${config.label.toUpperCase()}`;
  if (poiResultsList) poiResultsList.innerHTML = `<div style="padding:16px; font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted); text-align:center;">Searching places nearby...</div>`;

  showToast(`Searching for nearby ${config.label}... ${config.icon}`);

  const d = 0.3; // ~20 mile radius bounding box around right-click target
  const minLon = (centerPoint.lng - d).toFixed(6);
  const maxLat = (centerPoint.lat + d).toFixed(6);
  const maxLon = (centerPoint.lng + d).toFixed(6);
  const minLat = (centerPoint.lat - d).toFixed(6);

  const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(config.query)}&format=json&limit=8&lat=${centerPoint.lat.toFixed(6)}&lon=${centerPoint.lng.toFixed(6)}&viewbox=${minLon},${maxLat},${maxLon},${minLat}&bounded=1`;

  try {
    const res = await fetch(searchUrl, {
      headers: { "User-Agent": "IterViaeRoadPlanner/1.0" }
    });

    if (!res.ok) throw new Error("Search network error");
    let data = await res.json();

    if (!data || data.length === 0) {
      // Fallback with 1.0 degree box (~60 miles) ALWAYS anchored at centerPoint
      const wideMinLon = (centerPoint.lng - 1.0).toFixed(6);
      const wideMaxLat = (centerPoint.lat + 1.0).toFixed(6);
      const wideMaxLon = (centerPoint.lng + 1.0).toFixed(6);
      const wideMinLat = (centerPoint.lat - 1.0).toFixed(6);

      const fallbackUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(config.query)}&format=json&limit=8&lat=${centerPoint.lat.toFixed(6)}&lon=${centerPoint.lng.toFixed(6)}&viewbox=${wideMinLon},${wideMaxLat},${wideMaxLon},${wideMinLat}&bounded=1`;

      const fallbackRes = await fetch(fallbackUrl, {
        headers: { "User-Agent": "IterViaeRoadPlanner/1.0" }
      });
      data = await fallbackRes.json();
    }

    if (!data || data.length === 0) {
      if (poiResultsList) poiResultsList.innerHTML = `<div style="padding:16px; font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted); text-align:center;">No nearby ${config.label} found within 60 miles.</div>`;
      showToast(`No nearby ${config.label} found at this location.`);
      return;
    }

    renderPOISearchResults(data, config.category, config.icon);
    showToast(`Found ${data.length} ${config.label} nearby ${config.icon}`);
  } catch (err) {
    console.warn("Spatial POI Search error:", err);
    if (poiResultsList) poiResultsList.innerHTML = `<div style="padding:16px; font-family:var(--font-mono); font-size:0.75rem; color:#ef4444; text-align:center;">Failed to fetch search results.</div>`;
    showToast("Failed to fetch nearby POIs.");
  }
}

function renderPOISearchResults(results: any[], defaultCat: StopCategory, defaultIcon: string) {
  if (!poiResultsList) return;
  clearSearchPOIMarkers();

  if (!results || results.length === 0) {
    poiResultsList.innerHTML = `<div style="padding:16px; font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted); text-align:center;">No matching places found nearby.</div>`;
    return;
  }

  const items: POISearchResult[] = results.map((item) => ({
    title: item.display_name.split(",")[0],
    category: defaultCat,
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
    address: item.display_name
  }));

  const bounds = new maplibregl.LngLatBounds();
  let html = "";

  items.forEach((poi, i) => {
    bounds.extend([poi.lon, poi.lat]);

    html += `
      <div class="search-result-item" data-idx="${i}">
        <div class="search-result-left">
          <span class="search-result-title">${defaultIcon} ${escapeXml(poi.title)}</span>
          <span class="search-result-subtitle">${escapeXml(poi.address || "")}</span>
        </div>
        <button type="button" class="btn-add-poi-result" data-idx="${i}">+ Add Stop</button>
      </div>
    `;

    // Drop interactive temporary marker on map surface
    if (map) {
      const el = document.createElement("div");
      el.className = "poi-map-marker";
      el.innerHTML = `<div style="background:#f59e0b; color:#fff; border:2px solid #0f172a; padding:4px 8px; border-radius:12px; font-family:var(--font-mono); font-size:0.7rem; font-weight:800; box-shadow:0 4px 12px rgba(0,0,0,0.4); cursor:pointer;">${defaultIcon} ${poi.title}</div>`;

      const popupHtml = `
        <div style="padding:4px;">
          <h4 style="margin:0 0 4px 0; font-family:var(--font-sans); font-size:0.85rem; color:#0f172a;">${defaultIcon} ${escapeXml(poi.title)}</h4>
          <p style="margin:0 0 8px 0; font-family:var(--font-mono); font-size:0.7rem; color:#64748b;">${escapeXml(poi.address || "")}</p>
          <button id="btn-add-poi-map-${i}" style="width:100%; background:#10b981; color:#fff; border:none; padding:6px 12px; border-radius:6px; font-family:var(--font-mono); font-size:0.72rem; font-weight:800; cursor:pointer;">+ Add to Expedition Route</button>
        </div>
      `;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([poi.lon, poi.lat])
        .setPopup(new maplibregl.Popup({ offset: 12 }).setHTML(popupHtml))
        .addTo(map);

      activePoiSearchMarkers.push(marker);

      marker.getPopup().on("open", () => {
        const addBtn = document.getElementById(`btn-add-poi-map-${i}`);
        if (addBtn) {
          addBtn.onclick = () => {
            addPOIToExpedition(poi);
            marker.remove();
          };
        }
      });
    }
  });

  poiResultsList.innerHTML = html;

  if (map && items.length > 0) {
    map.fitBounds(bounds, { padding: { top: 100, bottom: 80, left: 380, right: 380 }, maxZoom: 14, duration: 800 });
  }

  poiResultsList.querySelectorAll(".search-result-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      const idx = parseInt((el as HTMLElement).dataset.idx || "0", 10);
      const poi = items[idx];
      if (!poi) return;

      const target = e.target as HTMLElement;
      if (target.classList.contains("btn-add-poi-result")) {
        addPOIToExpedition(poi);
      } else {
        if (map) map.flyTo({ center: [poi.lon, poi.lat], zoom: 14, duration: 800 });
      }
    });
  });
}

function addPOIToExpedition(poi: POISearchResult) {
  const newWp: Waypoint = {
    id: `wp-poi-${Date.now()}`,
    title: poi.title,
    lat: poi.lat,
    lon: poi.lon,
    type: "stop"
  };

  setWaypointCategory(newWp, poi.category);

  // Spatial algorithm: Insert stop between the closest two route waypoints
  const insertIndex = findOptimalInsertionIndex(poi.lat, poi.lon);
  if (insertIndex >= waypoints.length) {
    if (waypoints.length > 0 && waypoints[waypoints.length - 1].type === "destination") {
      waypoints.splice(waypoints.length - 1, 0, newWp);
    } else {
      waypoints.push(newWp);
    }
  } else {
    waypoints.splice(insertIndex, 0, newWp);
  }

  if (poiResultsPanel) poiResultsPanel.style.display = "none";
  clearSearchPOIMarkers();

  renderWaypointsUI();
  renderWaypointMapMarkers();
  updateExpeditionRoute();

  showToast(`Added ${poi.title} to Expedition Route at Stop #${insertIndex + 1} 📍`);
}

/**
 * Iter Viae v2.0 Local-First Draft Auto-Saver:
 * Automatically persists active workspace canvas state into LocalStorage on every mutation (< 1 ms latency)
 */
function saveActiveDraftToLocalStorage() {
  try {
    const encodedPolyline = encodePolyline6(lastRouteCoordinates);
    const compactLegs = currentRouteLegs.map((leg) => ({
      startLat: Number(leg.startLat.toFixed(5)),
      startLon: Number(leg.startLon.toFixed(5)),
      endLat: Number(leg.endLat.toFixed(5)),
      endLon: Number(leg.endLon.toFixed(5)),
      encodedPolyline: leg.encodedPolyline || (leg.coordinates ? encodePolyline6(leg.coordinates) : ""),
      distanceMi: Number(leg.distanceMi.toFixed(2)),
      durationSec: Math.round(leg.durationSec)
    }));

    localStorage.setItem("iterviae_v2_active_draft", JSON.stringify({
      tripId: currentTripId,
      title: currentTripTitle,
      summary: currentTripSummary,
      waypoints: waypoints,
      expeditionStartTime: expeditionStartTime,
      vehicleProfile: vehicleProfile,
      encodedPolyline: encodedPolyline,
      legs: currentLegMetrics,
      routeLegs: compactLegs,
      updatedAt: new Date().toISOString()
    }));
  } catch (e) {
    // LocalStorage quota safeguard
  }
}

/**
 * Iter Viae v2.0 Local-First Draft Restorer:
 * Restores active workspace draft instantly (< 10 ms) on app launch
 */
function restoreActiveDraftFromLocalStorage(): boolean {
  try {
    const raw = localStorage.getItem("iterviae_v2_active_draft");
    if (!raw) return false;

    const draft = JSON.parse(raw);
    if (!draft || !Array.isArray(draft.waypoints) || draft.waypoints.length === 0) return false;

    currentTripId = draft.tripId || null;
    currentTripTitle = (draft.title || "MY EXPEDITION ROUTE").toUpperCase();
    currentTripSummary = draft.summary || "";
    waypoints = draft.waypoints;

    if (draft.expeditionStartTime) expeditionStartTime = draft.expeditionStartTime;
    if (draft.vehicleProfile) syncVehicleProfileToUI(draft.vehicleProfile);

    if (draft.encodedPolyline) {
      lastRouteCoordinates = decodePolyline6(draft.encodedPolyline);
    } else if (Array.isArray(draft.coordinates)) {
      lastRouteCoordinates = draft.coordinates;
    }

    if (Array.isArray(draft.legs)) currentLegMetrics = draft.legs;
    if (Array.isArray(draft.routeLegs)) currentRouteLegs = draft.routeLegs;

    if (tripTitleText) tripTitleText.textContent = currentTripTitle;
    if (modalTripTitle) modalTripTitle.value = currentTripTitle;
    if (modalTripSummary) modalTripSummary.value = currentTripSummary;

    return true;
  } catch (e) {
    console.warn("Failed to restore local draft from localStorage:", e);
    return false;
  }
}

// Save & Publish Trip to Cloud Backend (PocketBase - Progressive Fallbacks)
async function publishActiveTripToCloud() {
  if (!PocketBaseAuth.isAuthenticated()) {
    alert("Please sign in to publish trips to your private cloud logbook.");
    openAuthModal();
    return;
  }

  const user = PocketBaseAuth.getUser() as any;

  try {
    showToast("Publishing expedition route to cloud... ☁️");

    const encodedPolyline = encodePolyline6(lastRouteCoordinates);
    const compactLegs = currentRouteLegs.map((leg) => ({
      startLat: Number(leg.startLat.toFixed(5)),
      startLon: Number(leg.startLon.toFixed(5)),
      endLat: Number(leg.endLat.toFixed(5)),
      endLon: Number(leg.endLon.toFixed(5)),
      encodedPolyline: leg.encodedPolyline || (leg.coordinates ? encodePolyline6(leg.coordinates) : ""),
      distanceMi: Number(leg.distanceMi.toFixed(2)),
      durationSec: Math.round(leg.durationSec)
    }));

    const baseMetrics = {
      distance: metricDistance?.textContent || "0.0 MI",
      duration: metricDuration?.textContent || "0H 0M",
      summary: currentTripSummary,
      vehicleProfile: vehicleProfile,
      encodedPolyline: encodedPolyline,
      routeLegs: compactLegs,
      legMetrics: currentLegMetrics,
      itinerary: {
        startTime: expeditionStartTime
      }
    };

    const payload1: any = {
      user: user.id,
      title: currentTripTitle,
      summary: currentTripSummary,
      waypoints: waypoints,
      route_geometry: {
        type: "Polyline6",
        polyline: encodedPolyline
      },
      itinerary: {
        startTime: expeditionStartTime,
        waypoints: waypoints
      },
      metrics: baseMetrics
    };

    try {
      if (currentTripId) {
        await pb.collection("trips").update(currentTripId, payload1);
      } else {
        const record = await pb.collection("trips").create(payload1);
        currentTripId = record.id;
      }
      saveActiveDraftToLocalStorage();
      showToast(`Published "${currentTripTitle}" to Cloud! ☁️`);
    } catch (err1: any) {
      console.warn("Save attempt 1 (Full Payload) failed:", extractPocketBaseError(err1));

      const payload2: any = {
        user: user.id,
        title: currentTripTitle,
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
        saveActiveDraftToLocalStorage();
        showToast(`Published "${currentTripTitle}" to Cloud! ☁️`);
      } catch (err2: any) {
        console.warn("Save attempt 2 failed:", extractPocketBaseError(err2));

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
          saveActiveDraftToLocalStorage();
          showToast(`Published "${currentTripTitle}" to Cloud! ☁️`);
        } catch (err3: any) {
          console.error("All publish attempts failed. Final error:", err3);
          const errDetails = extractPocketBaseError(err3);
          alert("Failed to publish trip to Cloud:\n\n" + errDetails);
        }
      }
    }
  } catch (err: any) {
    console.error("Publish process error:", err);
    alert("Error publishing trip: " + (err.message || extractPocketBaseError(err)));
  }
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
          <button class="btn btn-primary btn-sm btn-load-trip" data-id="${record.id}" onclick="loadTripIntoWorkspace('${record.id}')">
            ${isCurrentActive ? '✓ Currently Loaded' : '📂 Load Route'}
          </button>
          <button class="btn btn-outline btn-sm btn-delete-trip" data-id="${record.id}" onclick="deleteTripFromCloud('${record.id}', this)" style="color: #f87171; border-color: rgba(239,68,68,0.3);">
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

// Cancel Loading Route Listener
if (cancelRouteLoadingBtn) {
  cancelRouteLoadingBtn.addEventListener("click", () => {
    activeRouteLoadingToken = null;
    if (routeLoadingModal) routeLoadingModal.style.display = "none";
    showToast("Route loading cancelled");
  });
}

// Load Specific Saved Trip into Workspace Map
async function loadTripIntoWorkspace(tripId: string) {
  // 1. Instantly close Saved Trips Modal so it doesn't linger or freeze!
  closeSavedTripsModal();

  // 2. Setup Route Loading overlay & cancellation token
  const loadingToken = `load_${tripId}_${Date.now()}`;
  activeRouteLoadingToken = loadingToken;

  if (routeLoadingModal) routeLoadingModal.style.display = "flex";
  if (routeLoadingSubtitle) {
    routeLoadingSubtitle.textContent = "Fetching route record & waypoints from cloud...";
  }

  try {
    const record = await pb.collection("trips").getOne(tripId);

    // If cancelled while fetching record
    if (activeRouteLoadingToken !== loadingToken) {
      console.log("Route loading cancelled by user.");
      return;
    }

    if (!record) {
      if (routeLoadingModal) routeLoadingModal.style.display = "none";
      activeRouteLoadingToken = null;
      return;
    }

    const titleUpper = (record.title || "MY EXPEDITION ROUTE").toUpperCase();
    if (routeLoadingSubtitle) {
      routeLoadingSubtitle.textContent = `Calculating Valhalla route line & metrics for "${titleUpper}"...`;
    }

    currentTripId = record.id;
    currentTripTitle = titleUpper;
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

    // Check for pre-computed geometry in Cloud DB or LocalStorage cache for instant (0ms) load
    const storedPolyline = record.metrics?.encodedPolyline;
    const storedCoords = storedPolyline
      ? decodePolyline6(storedPolyline)
      : (record.metrics?.routeCoordinates || (record.route_geometry?.features?.[0]?.geometry?.coordinates));
    const storedLegs = record.metrics?.routeLegs;
    const storedMetrics = record.metrics?.legMetrics;

    if (Array.isArray(storedCoords) && storedCoords.length >= 2) {
      console.log(`Instant Route Load: Restored pre-computed geometry from cloud DB for trip ${tripId}`);
      lastRouteCoordinates = storedCoords;
      currentRouteLegs = Array.isArray(storedLegs) ? storedLegs : [];
      currentLegMetrics = Array.isArray(storedMetrics) ? storedMetrics : [];

      if (metricDistance && record.metrics?.distance) metricDistance.textContent = record.metrics.distance;
      if (metricDuration && record.metrics?.duration) metricDuration.textContent = record.metrics.duration;

      redrawRouteLine();
      updateLegBadgesUI();
    } else {
      // Fallback to incremental fetch if record is missing pre-computed geometry
      await updateExpeditionRoute();
    }

    // If cancelled while updating
    if (activeRouteLoadingToken !== loadingToken) {
      console.log("Route loading cancelled by user during route calculation.");
      return;
    }

    fitMapToAllWaypoints();

    // Close Route Loading overlay upon completion
    if (routeLoadingModal) routeLoadingModal.style.display = "none";
    activeRouteLoadingToken = null;

    showToast(`Loaded Expedition Route: ${currentTripTitle}`);
  } catch (err: any) {
    if (routeLoadingModal) routeLoadingModal.style.display = "none";
    activeRouteLoadingToken = null;
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
async function deleteTripFromCloud(tripId: string, btnElement?: HTMLElement) {
  console.log("deleteTripFromCloud triggered for tripId:", tripId);
  const cardElement = btnElement ? (btnElement.closest(".saved-trip-card") as HTMLElement) : null;

  try {
    if (cardElement) {
      cardElement.style.opacity = "0.3";
      cardElement.style.pointerEvents = "none";
    }
    console.log(`Executing PocketBase delete for trip ID: ${tripId}...`);
    await pb.collection("trips").delete(tripId, { requestKey: null });
    console.log("PocketBase delete successful!");

    if (currentTripId === tripId) {
      currentTripId = null;
    }
    showToast("Expedition trip deleted.");
    if (cardElement) {
      cardElement.remove();
    }
    loadUserSavedTrips();
  } catch (err: any) {
    if (err.isAbort) return; // Suppress harmless PocketBase abort signals
    console.error("Failed to delete trip from PocketBase:", err);
    alert("PocketBase Delete Error: " + (err.message || err.toString() || "Unknown error"));
    if (cardElement) {
      cardElement.style.opacity = "1";
      cardElement.style.pointerEvents = "auto";
    }
  }
}

(window as any).deleteTripFromCloud = deleteTripFromCloud;
(window as any).loadTripIntoWorkspace = loadTripIntoWorkspace;

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

// Fetch & Sync All Cloud Trips to Local Device Storage
async function syncCloudTripsToDeviceStorage() {
  if (!PocketBaseAuth.isAuthenticated()) {
    alert("Please sign in to sync cloud trips to your device.");
    openAuthModal();
    return;
  }

  const user = PocketBaseAuth.getUser() as any;

  try {
    showToast("Syncing cloud trips to device storage... 📥");

    const records = await pb.collection("trips").getFullList({
      filter: `user = "${user.id}"`,
      sort: "-updated"
    });

    if (records.length === 0) {
      showToast("No cloud trips found to sync.");
      return;
    }

    let syncedCount = 0;
    records.forEach((record: any) => {
      try {
        localStorage.setItem(`iterviae_route_cache_${record.id}`, JSON.stringify({
          tripId: record.id,
          title: record.title,
          summary: record.summary,
          waypoints: record.waypoints,
          metrics: record.metrics,
          updated: record.updated
        }));
        syncedCount++;
      } catch (e) {
        // LocalStorage quota safeguard
      }
    });

    showToast(`Synced ${syncedCount} Cloud Trip(s) to Device Storage! 📥`);
  } catch (err: any) {
    console.error("Cloud trip sync error:", err);
    alert("Error syncing cloud trips: " + (err.message || extractPocketBaseError(err)));
  }
}

// Navigation Dropdown Menu Handlers
if (toggleNavMenuBtn && navMenuDropdownCard) {
  toggleNavMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isVisible = navMenuDropdownCard.style.display === "flex";
    navMenuDropdownCard.style.display = isVisible ? "none" : "flex";
  });

  document.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    if (navMenuDropdownCard && !target.closest("#nav-expedition-menu")) {
      navMenuDropdownCard.style.display = "none";
    }
  });
}

if (menuPublishBtn) {
  menuPublishBtn.addEventListener("click", () => {
    if (navMenuDropdownCard) navMenuDropdownCard.style.display = "none";
    publishActiveTripToCloud();
  });
}

if (menuSyncCloudBtn) {
  menuSyncCloudBtn.addEventListener("click", () => {
    if (navMenuDropdownCard) navMenuDropdownCard.style.display = "none";
    syncCloudTripsToDeviceStorage();
  });
}

if (menuSavedTripsBtn) {
  menuSavedTripsBtn.addEventListener("click", () => {
    if (navMenuDropdownCard) navMenuDropdownCard.style.display = "none";
    openSavedTripsModal();
  });
}

if (menuSaveLocalBtn) {
  menuSaveLocalBtn.addEventListener("click", () => {
    if (navMenuDropdownCard) navMenuDropdownCard.style.display = "none";
    exportLocalTripFile();
  });
}

if (menuOpenLocalBtn) {
  menuOpenLocalBtn.addEventListener("click", () => {
    if (navMenuDropdownCard) navMenuDropdownCard.style.display = "none";
    if (importIterviaeInput) importIterviaeInput.click();
  });
}

if (importIterviaeInput) {
  importIterviaeInput.addEventListener("change", (e) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      loadLocalTripFile(target.files[0]);
      target.value = "";
    }
  });
}

const menuDebugRouteBtn = document.getElementById("menu-debug-route-btn");

function runRouteDiagnostics() {
  const validWaypoints = waypoints.filter((w) => w.lat !== null && w.lon !== null);
  const totalWaypoints = waypoints.length;
  const validCount = validWaypoints.length;
  const roadPoints = lastRouteCoordinates ? lastRouteCoordinates.length : 0;
  const legCount = currentRouteLegs ? currentRouteLegs.length : 0;
  const mapLoaded = Boolean(map);
  const layerExists = map ? Boolean(map.getLayer("expedition-route-layer")) : false;

  let report = `🐞 ROUTE DIAGNOSTICS REPORT:\n\n`;
  report += `• Map Loaded: ${mapLoaded ? "YES ✅" : "NO ❌"}\n`;
  report += `• Route Layer on Canvas: ${layerExists ? "YES ✅" : "NO ❌"}\n`;
  report += `• Total Waypoints in List: ${totalWaypoints}\n`;
  report += `• Valid Waypoints (with Lat/Lon): ${validCount} / ${totalWaypoints}\n`;
  report += `• Current Leg Geometries Cached: ${legCount}\n`;
  report += `• Total Road Polyline Vertices: ${roadPoints}\n\n`;

  if (validCount < 2) {
    report += `⚠️ REASON FOR NO ROUTE LINE:\n`;
    report += `Fewer than 2 waypoints have valid latitude/longitude coordinates.\n`;
    report += `Please type an address and hit Enter, or select a location from search suggestions!`;
  } else if (roadPoints < 2) {
    report += `⚠️ REASON FOR NO ROUTE LINE:\n`;
    report += `The routing server has not returned polyline coordinates yet.\n`;
    report += `Click "Recalculate Route" in the Menu to re-query the routing server!`;
  } else {
    report += `✅ ROUTE PIPELINE OK!\n`;
    report += `Route line with ${roadPoints} road points is actively drawn on the map canvas.`;
  }

  alert(report);
}

if (menuRecalculateBtn) {
  menuRecalculateBtn.addEventListener("click", () => {
    if (navMenuDropdownCard) navMenuDropdownCard.style.display = "none";
    showToast("Recalculating expedition route... 🔄");
    updateExpeditionRoute(true);
  });
}

if (menuDebugRouteBtn) {
  menuDebugRouteBtn.addEventListener("click", () => {
    if (navMenuDropdownCard) navMenuDropdownCard.style.display = "none";
    runRouteDiagnostics();
  });
}

if (menuExportGpxBtn) {
  menuExportGpxBtn.addEventListener("click", () => {
    if (navMenuDropdownCard) navMenuDropdownCard.style.display = "none";
    exportExpeditionToGPX();
  });
}

if (menuImportGpxBtn) {
  menuImportGpxBtn.addEventListener("click", () => {
    if (navMenuDropdownCard) navMenuDropdownCard.style.display = "none";
    const importGpxInput = document.getElementById("import-gpx-input");
    if (importGpxInput) importGpxInput.click();
  });
}

if (menuVehicleBtn) {
  menuVehicleBtn.addEventListener("click", () => {
    if (navMenuDropdownCard) navMenuDropdownCard.style.display = "none";
    openVehicleModal();
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

  console.log("Initializing MapLibre GL Map Surface - Local TileServer GL Engine...");

  map = new maplibregl.Map({
    container: "map-container",
    style: MAP_SURFACE_STYLES["vector"],
    center: DEFAULT_CENTER,
    zoom: 13,
    minZoom: 3,
    maxZoom: 16.8,
    pitch: 0,
    bearing: 0,
    attributionControl: false
  });

  // Map Style Selector Dropdown Handler
  const mapStyleSelect = document.getElementById("map-style-select") as HTMLSelectElement | null;
  if (mapStyleSelect) {
    mapStyleSelect.addEventListener("change", () => {
      changeMapStyle(mapStyleSelect.value);
    });
  }

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

    const restored = restoreActiveDraftFromLocalStorage();
    if (restored) {
      console.log(`Iter Viae v2.0: Restored active working draft "${currentTripTitle}" from localStorage (< 10 ms)`);
      renderWaypointsUI();
      renderWaypointMapMarkers();
      redrawRouteLine();
      updateLegBadgesUI();
      fitMapToAllWaypoints();

      // Auto-upgrade any legacy straight lines from restored LocalStorage draft
      updateExpeditionRoute(true);
      showToast(`Restored Working Draft: ${currentTripTitle}`);
    } else {
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
    }
  });

  setTimeout(() => {
    map?.resize();
  }, 100);

  setTimeout(() => {
    map?.resize();
  }, 400);
}

// Right-Click Context Menu POI Search Handlers
document.querySelectorAll(".context-poi-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const categoryKey = (btn as HTMLElement).dataset.category;
    hideContextMenu();
    if (categoryKey && lastRightClickLngLat) {
      executePOISearchAroundPoint(categoryKey, lastRightClickLngLat);
    }
  });
});

// Context Menu Handlers
function copyCoordinatesToClipboard() {
  if (!lastRightClickLngLat) return;
  const coordString = `${lastRightClickLngLat.lat.toFixed(6)}, ${lastRightClickLngLat.lng.toFixed(6)}`;
  navigator.clipboard.writeText(coordString);
  showToast(`Copied ${coordString} to clipboard!`);
  hideContextMenu();
}

if (contextCoordsItem) contextCoordsItem.addEventListener("click", copyCoordinatesToClipboard);

if (poiPanelClose) {
  poiPanelClose.addEventListener("click", () => {
    if (poiResultsPanel) poiResultsPanel.style.display = "none";
    clearSearchPOIMarkers();
  });
}

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

// Coordinate Search & POI Search Form Handler
if (coordSearchForm && coordSearchInput) {
  coordSearchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    hideContextMenu();
    const query = coordSearchInput.value.trim();
    if (!query || !map) return;

    // Check if query is explicit Lat, Lon format
    const parts = query.split(/[\s,]+/).filter(Boolean);
    if (parts.length === 2 && !isNaN(parseFloat(parts[0])) && !isNaN(parseFloat(parts[1]))) {
      const lat = parseFloat(parts[0]);
      const lon = parseFloat(parts[1]);
      if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
        map.flyTo({ center: [lon, lat], zoom: 14, speed: 1.4, essential: true });
        addPinAtLocation(lat, lon);
        return;
      }
    }

    // Otherwise, perform Place Search around active map center
    executePOISearchAroundPoint(query);
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
      if (newTripBtn) newTripBtn.style.display = "inline-flex";
      if (openItineraryBtn) openItineraryBtn.style.display = "inline-flex";
      if (saveTripBtn) saveTripBtn.style.display = "inline-flex";
      if (exportGPXBtn) exportGPXBtn.style.display = "inline-flex";
      if (importGPXBtn) importGPXBtn.style.display = "inline-flex";
      if (navVehicleBtn) navVehicleBtn.style.display = "inline-flex";
      if (navSavedTripsBtn) navSavedTripsBtn.style.display = "inline-flex";
      if (navExpeditionMenu) navExpeditionMenu.style.display = "inline-block";
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
      if (newTripBtn) newTripBtn.style.display = "none";
      if (openItineraryBtn) openItineraryBtn.style.display = "none";
      if (saveTripBtn) saveTripBtn.style.display = "none";
      if (exportGPXBtn) exportGPXBtn.style.display = "none";
      if (importGPXBtn) importGPXBtn.style.display = "none";
      if (navVehicleBtn) navVehicleBtn.style.display = "none";
      if (navSavedTripsBtn) navSavedTripsBtn.style.display = "none";
      if (navExpeditionMenu) navExpeditionMenu.style.display = "none";
      if (guestView) guestView.style.display = "none";
      if (verifiedView) verifiedView.style.display = "none";
      if (unverifiedView) unverifiedView.style.display = "flex";
      if (appFooter) appFooter.style.display = "block";
      if (unverifiedUserEmail) unverifiedUserEmail.textContent = user?.email || "your account";
    }
  } else {
    // Guest View (Not logged in)
    if (newTripBtn) newTripBtn.style.display = "none";
    if (openItineraryBtn) openItineraryBtn.style.display = "none";
    if (saveTripBtn) saveTripBtn.style.display = "none";
    if (exportGPXBtn) exportGPXBtn.style.display = "none";
    if (importGPXBtn) importGPXBtn.style.display = "none";
    if (navVehicleBtn) navVehicleBtn.style.display = "none";
    if (navSavedTripsBtn) navSavedTripsBtn.style.display = "none";
    if (navExpeditionMenu) navExpeditionMenu.style.display = "none";
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
