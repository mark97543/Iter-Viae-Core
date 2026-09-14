import "./styles.css";
import { pb, SavedTripRecord } from "./pocketbase";
import { haversineDistance, formatDistance, formatDuration } from "./valhalla";

console.log("ITER VIAE Tactical Mobile Cockpit & Logbook initialized.");

export interface WaypointCompletion {
  completed: boolean;
  completedAt: string | null;
  timestampMs: number | null;
}

// State Variables
let currentPosition: { lat: number; lon: number; speedMph: number; heading: number | null } | null = null;
let activeTrip: SavedTripRecord | null = null;
let currentWaypointIndex: number = 0;
let waypointCompletions: Record<number, WaypointCompletion> = {};

let wakeLockSentinel: any = null;
let watchPositionId: number | null = null;

// Tactile Haptic Vibration Feedback Helper
function triggerHapticFeedback(pattern: number | number[] = 18) {
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch (_) {}
  }
}

// Speech Synthesis Helper
function speakText(text: string) {
  if ("speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (_) {}
  }
}


// DOM Elements — Summary Card
const dashRouteTitle = document.getElementById("dash-route-title");
const dashRouteSubtitle = document.getElementById("dash-route-subtitle");
const dashRoutePct = document.getElementById("dash-route-pct");
const dashProgressFill = document.getElementById("dash-progress-fill");

const statCompletedCount = document.getElementById("stat-completed-count");
const dockDistVal = document.getElementById("dock-dist-val");
const dockEtaVal = document.getElementById("dock-eta-val");

// DOM Elements — Active Stop Hero Card View
const heroWpIndex = document.getElementById("hero-wp-index");
const heroWpCat = document.getElementById("hero-wp-cat");
const heroWpDoneBadge = document.getElementById("hero-wp-done-badge");
const dashCurrTitle = document.getElementById("dash-curr-title");
const dashCurrDepart = document.getElementById("dash-curr-depart");
const dashCurrBreak = document.getElementById("dash-curr-break");
const dashCurrBudget = document.getElementById("dash-curr-budget");
const dashCurrDist = document.getElementById("dash-curr-dist");
const dashNotesText = document.getElementById("dash-notes-text");
const btnReadNotes = document.getElementById("btn-read-notes");
const dashNextTitle = document.getElementById("dash-next-title");
const dashNextPill = document.getElementById("dash-next-pill");

// DOM Elements — Hero Action Bar
const btnDashPrev = document.getElementById("btn-dash-prev");
const btnDashNextStep = document.getElementById("btn-dash-next-step");
const btnDashGmaps = document.getElementById("btn-dash-gmaps");



const mobileTripsModal = document.getElementById("mobile-trips-modal");
const mobileTripsList = document.getElementById("mobile-trips-list");
const tripsLoadingSpinner = document.getElementById("trips-loading-spinner");
const btnOpenTrips = document.getElementById("btn-open-trips");
const tripsModalClose = document.getElementById("trips-modal-close");

const mobileSummaryModal = document.getElementById("mobile-summary-modal");
const summaryTripTitle = document.getElementById("summary-trip-title");
const summaryTripSubtitle = document.getElementById("summary-trip-subtitle");
const summaryStatCount = document.getElementById("summary-stat-count");
const summaryStatTime = document.getElementById("summary-stat-time");
const summaryStatDist = document.getElementById("summary-stat-dist");
const summaryLogbookList = document.getElementById("summary-logbook-list");
const summaryModalClose = document.getElementById("summary-modal-close");
const summaryCloseBtn = document.getElementById("summary-close-btn");

// Buttons & Auth Elements
const authStatusText = document.getElementById("auth-status-text");
const mobileAuthModal = document.getElementById("mobile-auth-modal");
const authModalClose = document.getElementById("auth-modal-close");
const mobileLoginForm = document.getElementById("mobile-login-form") as HTMLFormElement | null;
const mobileAuthEmail = document.getElementById("mobile-auth-email") as HTMLInputElement | null;
const mobileAuthPassword = document.getElementById("mobile-auth-password") as HTMLInputElement | null;
const authErrorMsg = document.getElementById("auth-error-msg");
const btnToggleAuthMode = document.getElementById("btn-toggle-auth-mode");
const btnSubmitAuth = document.getElementById("btn-submit-auth");
const authModalTitle = document.getElementById("auth-modal-title");
const authModalSubtitle = document.getElementById("auth-modal-subtitle");
let isSignUpMode = false;

// Persistence Helpers for Checklist Completion Timestamps
function getCompletionStorageKey(tripId: string): string {
  return `iterviae_completions_${tripId}`;
}

function saveCompletionState() {
  if (!activeTrip || !activeTrip.id) return;
  try {
    localStorage.setItem(getCompletionStorageKey(activeTrip.id), JSON.stringify(waypointCompletions));
  } catch (e) {
    console.warn("Failed to save waypoint completion state:", e);
  }
}

function loadCompletionState() {
  if (!activeTrip || !activeTrip.id) {
    waypointCompletions = {};
    return;
  }
  try {
    const raw = localStorage.getItem(getCompletionStorageKey(activeTrip.id));
    if (raw) {
      waypointCompletions = JSON.parse(raw);
    } else {
      waypointCompletions = {};
    }
  } catch (e) {
    waypointCompletions = {};
  }
}

// Category Badge Resolver
function getCategoryInfo(wp: any): { icon: string; label: string } {
  if (wp.isFuelStop || (wp.category && wp.category === "gas")) return { icon: "⛽", label: "GAS STOP" };
  if (wp.isOvernight || (wp.category && wp.category === "lodging")) return { icon: "🏨", label: "LODGING" };
  if (wp.category === "restaurant") return { icon: "🍽️", label: "DINING" };
  if (wp.category === "attraction") return { icon: "⛰️", label: "SIGHTSEEING" };
  return { icon: "📍", label: "CHECKPOINT" };
}

// Checkpoint Completion Handler
function toggleWaypointCompletion(index: number) {
  if (!activeTrip || !activeTrip.waypoints) return;
  const valid = activeTrip.waypoints.filter((w) => w.lat !== null && w.lon !== null);
  if (index < 0 || index >= valid.length) return;

  const isAlreadyDone = waypointCompletions[index]?.completed;
  if (!isAlreadyDone) {
    const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    waypointCompletions[index] = {
      completed: true,
      completedAt: nowStr,
      timestampMs: Date.now()
    };
    triggerHapticFeedback([30, 50, 30]);
    showToast(`✅ Checked off ${valid[index].title || `Checkpoint #${index + 1}`} (${nowStr})`);

    const nextUncompleted = findNextUncompletedIndex(index);
    if (nextUncompleted !== -1) {
      currentWaypointIndex = nextUncompleted;
    } else {
      showToast("🏁 All expedition checkpoints completed!");
      renderSummaryModal();
    }
  } else {
    waypointCompletions[index] = {
      completed: false,
      completedAt: null,
      timestampMs: null
    };
    triggerHapticFeedback(20);
    showToast(`Unchecked ${valid[index].title || `Checkpoint #${index + 1}`}`);
  }

  saveCompletionState();
  renderDashboardDeck();
}

function findNextUncompletedIndex(fromIdx: number): number {
  if (!activeTrip || !activeTrip.waypoints) return -1;
  const valid = activeTrip.waypoints.filter((w) => w.lat !== null && w.lon !== null);

  for (let i = fromIdx + 1; i < valid.length; i++) {
    if (!waypointCompletions[i]?.completed) {
      return i;
    }
  }
  for (let i = 0; i < valid.length; i++) {
    if (!waypointCompletions[i]?.completed) {
      return i;
    }
  }
  return -1;
}

// Hero Deck "NEXT STOP" Button Handler: Stamps completion on current stop & advances
function handleHeroNextStep() {
  if (!activeTrip || !activeTrip.waypoints) {
    if (mobileTripsModal) mobileTripsModal.style.display = "flex";
    loadSavedTripsFromCloud();
    return;
  }

  const valid = activeTrip.waypoints.filter((w) => w.lat !== null && w.lon !== null);
  if (valid.length === 0) return;

  const isAlreadyDone = waypointCompletions[currentWaypointIndex]?.completed;

  if (!isAlreadyDone) {
    const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    waypointCompletions[currentWaypointIndex] = {
      completed: true,
      completedAt: nowStr,
      timestampMs: Date.now()
    };
    saveCompletionState();
    triggerHapticFeedback([30, 50, 30]);
    showToast(`✅ Checked off ${valid[currentWaypointIndex].title || `Checkpoint #${currentWaypointIndex + 1}`} (${nowStr})`);
  } else {
    triggerHapticFeedback(20);
  }

  if (currentWaypointIndex < valid.length - 1) {
    currentWaypointIndex++;
  } else {
    showToast("🏁 All expedition checkpoints completed!");
    renderSummaryModal();
  }

  renderDashboardDeck();
}

// Geolocation Watcher Loop
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
      renderDashboardDeck();
    },
    (err) => {
      console.warn("GPS Location error:", err);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 1000 }
  );
}

// Primary Render Engine: Single-Focus Active Stop Hero Page View
function renderDashboardDeck() {
  if (!activeTrip || !activeTrip.waypoints || activeTrip.waypoints.length === 0) {
    if (dashRouteTitle) dashRouteTitle.textContent = "SELECT AN EXPEDITION ROUTE";
    if (dashRouteSubtitle) dashRouteSubtitle.textContent = "Open logbook to select a route";
    if (dashRoutePct) dashRoutePct.textContent = "0%";
    if (dashProgressFill) dashProgressFill.style.width = "0%";
    if (statCompletedCount) statCompletedCount.textContent = "0 / 0";
    if (dockDistVal) dockDistVal.textContent = "-- MI";
    if (dockEtaVal) dockEtaVal.textContent = "--H --M";

    if (heroWpIndex) heroWpIndex.textContent = "#0";
    if (heroWpCat) heroWpCat.textContent = "📍 NO ROUTE";
    if (heroWpDoneBadge) heroWpDoneBadge.style.display = "none";
    if (dashCurrTitle) dashCurrTitle.textContent = "No Expedition Active";
    if (dashCurrDepart) dashCurrDepart.textContent = "🛬 -- → 🛫 --";
    if (dashCurrBreak) dashCurrBreak.textContent = "⏱️ -- MIN";
    if (dashCurrBudget) dashCurrBudget.textContent = "💵 $0.00";
    if (dashCurrDist) dashCurrDist.textContent = "📏 -- MI";
    if (dashNotesText) dashNotesText.textContent = "Select an expedition route from your logbook to view checkpoint details and launch navigation.";
    if (dashNextTitle) dashNextTitle.textContent = "Load Route to Start";
    if (dashNextPill) dashNextPill.textContent = "0.0mi • 0m";
    if (btnDashNextStep) btnDashNextStep.textContent = "✅ NEXT STOP";
    return;
  }

  const valid = activeTrip.waypoints.filter((w) => w.lat !== null && w.lon !== null);
  if (valid.length === 0) return;

  if (currentWaypointIndex < 0) currentWaypointIndex = 0;
  if (currentWaypointIndex >= valid.length) currentWaypointIndex = valid.length - 1;

  const completedKeys = Object.keys(waypointCompletions).filter((k) => waypointCompletions[Number(k)]?.completed);
  const completedCount = completedKeys.length;
  const totalCount = valid.length;
  const pct = Math.round((completedCount / totalCount) * 100);

  // Update Expedition Summary Progress Bar Card
  if (dashRouteTitle) dashRouteTitle.textContent = `${activeTrip.title || "EXPEDITION ROUTE"}`;
  if (dashRouteSubtitle) dashRouteSubtitle.textContent = `${activeTrip.status || "Planned"} • ${totalCount} Checkpoints`;
  if (dashRoutePct) dashRoutePct.textContent = `${pct}%`;
  if (dashProgressFill) dashProgressFill.style.width = `${pct}%`;
  if (statCompletedCount) statCompletedCount.textContent = `${completedCount} / ${totalCount}`;

  // Calculate Remaining Distance & Travel Time
  let totalRemainingDist = 0;
  for (let i = 0; i < valid.length - 1; i++) {
    if (!waypointCompletions[i]?.completed) {
      totalRemainingDist += haversineDistance(valid[i].lat!, valid[i].lon!, valid[i + 1].lat!, valid[i + 1].lon!);
    }
  }

  const speedForEta = currentPosition ? Math.max(currentPosition.speedMph, 45) : 45;
  const etaSeconds = (totalRemainingDist / speedForEta) * 3600;

  if (dockDistVal) dockDistVal.textContent = formatDistance(totalRemainingDist);
  if (dockEtaVal) dockEtaVal.textContent = formatDuration(etaSeconds);

  // Get Active Checkpoint Data
  const wp = valid[currentWaypointIndex];
  const catInfo = getCategoryInfo(wp);
  const isDone = waypointCompletions[currentWaypointIndex]?.completed;
  const doneTime = waypointCompletions[currentWaypointIndex]?.completedAt;

  let distFromLiveVal = "-- MI";
  if (currentPosition) {
    const dist = haversineDistance(currentPosition.lat, currentPosition.lon, wp.lat!, wp.lon!);
    distFromLiveVal = formatDistance(dist);
  } else if (currentWaypointIndex > 0 && valid[currentWaypointIndex - 1]?.lat !== null) {
    const dist = haversineDistance(valid[currentWaypointIndex - 1].lat!, valid[currentWaypointIndex - 1].lon!, wp.lat!, wp.lon!);
    distFromLiveVal = formatDistance(dist);
  }

  const arriveStr = wp.eta || wp.arrivalTime || wp.scheduledArrival || "--";
  const departStr = wp.departTime || wp.scheduledDeparture || "--";
  const breakStr = wp.breakMin !== undefined ? `${wp.breakMin} MIN` : (wp.duration ? `${wp.duration}` : "--");
  const budgetVal = wp.budget !== undefined ? (typeof wp.budget === 'number' ? `$${wp.budget.toFixed(2)}` : `$${wp.budget}`) : "$0.00";

  // Populate Active Hero Card Fields
  if (heroWpIndex) heroWpIndex.textContent = `#${currentWaypointIndex + 1} of ${totalCount}`;
  if (heroWpCat) heroWpCat.textContent = `${catInfo.icon} ${catInfo.label}`;

  if (heroWpDoneBadge) {
    if (isDone) {
      heroWpDoneBadge.style.display = "inline-block";
      heroWpDoneBadge.textContent = `✅ DONE (${doneTime})`;
    } else {
      heroWpDoneBadge.style.display = "none";
    }
  }

  if (dashCurrTitle) dashCurrTitle.textContent = wp.title || `Checkpoint #${currentWaypointIndex + 1}`;
  if (dashCurrDepart) dashCurrDepart.textContent = `🛬 ${arriveStr} → 🛫 ${departStr}`;
  if (dashCurrBreak) dashCurrBreak.textContent = `⏱️ ${breakStr}`;
  if (dashCurrBudget) dashCurrBudget.textContent = `💵 ${budgetVal}`;
  if (dashCurrDist) dashCurrDist.textContent = `📏 ${distFromLiveVal}`;
  if (dashNotesText) dashNotesText.textContent = wp.notes || wp.description || wp.briefing || "No special briefing notes recorded for this checkpoint.";

  // Next Destination Preview Banner
  const nextIdx = currentWaypointIndex + 1;
  if (nextIdx < totalCount) {
    const nextWp = valid[nextIdx];
    if (dashNextTitle) dashNextTitle.textContent = `#${nextIdx + 1}: ${nextWp.title || "Next Checkpoint"}`;
    const legDist = haversineDistance(wp.lat!, wp.lon!, nextWp.lat!, nextWp.lon!);
    const legEtaSecs = (legDist / 45) * 3600;
    if (dashNextPill) dashNextPill.textContent = `${formatDistance(legDist)} • ${formatDuration(legEtaSecs)}`;
  } else {
    if (dashNextTitle) dashNextTitle.textContent = "🏁 FINAL EXPEDITION STOP";
    if (dashNextPill) dashNextPill.textContent = "END OF ROUTE";
  }

  // Update Hero Action Bar Next Button
  if (btnDashNextStep) {
    if (!isDone) {
      btnDashNextStep.textContent = "✅ NEXT STOP";
    } else if (currentWaypointIndex < totalCount - 1) {
      btnDashNextStep.textContent = "⏩ GO TO NEXT STOP";
    } else {
      btnDashNextStep.textContent = "🏁 FINISH EXPEDITION";
    }
  }
}



// Navigation Launcher into Google Maps App
function openInGoogleMaps(destLat: number, destLon: number, originLat?: number, originLon?: number) {
  let url = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLon}&travelmode=driving`;
  if (currentPosition) {
    url += `&origin=${currentPosition.lat},${currentPosition.lon}`;
  } else if (originLat !== undefined && originLon !== undefined) {
    url += `&origin=${originLat},${originLon}`;
  }
  window.open(url, "_blank");
}

// Render End-of-Trip Summary Modal
function renderSummaryModal() {
  if (!mobileSummaryModal || !activeTrip || !activeTrip.waypoints) return;

  const valid = activeTrip.waypoints.filter((w) => w.lat !== null && w.lon !== null);
  const completedKeys = Object.keys(waypointCompletions).filter((k) => waypointCompletions[Number(k)]?.completed);
  const totalCount = valid.length;
  const completedCount = completedKeys.length;

  if (summaryTripTitle) summaryTripTitle.textContent = activeTrip.title || "EXPEDITION LOGBOOK SUMMARY";
  if (summaryTripSubtitle) summaryTripSubtitle.textContent = `Completed ${completedCount} of ${totalCount} Waypoints`;
  if (summaryStatCount) summaryStatCount.textContent = `${completedCount} / ${totalCount}`;

  let totalDist = 0;
  for (let i = 0; i < valid.length - 1; i++) {
    totalDist += haversineDistance(valid[i].lat!, valid[i].lon!, valid[i + 1].lat!, valid[i + 1].lon!);
  }
  if (summaryStatDist) summaryStatDist.textContent = `${totalDist.toFixed(1)} MI`;

  const timestamps = completedKeys
    .map((k) => waypointCompletions[Number(k)]?.timestampMs)
    .filter((t): t is number => typeof t === "number")
    .sort((a, b) => a - b);

  if (timestamps.length >= 2) {
    const elapsedMs = timestamps[timestamps.length - 1] - timestamps[0];
    const totalSecs = Math.round(elapsedMs / 1000);
    if (summaryStatTime) summaryStatTime.textContent = formatDuration(totalSecs);
  } else {
    if (summaryStatTime) summaryStatTime.textContent = "--";
  }

  if (summaryLogbookList) {
    summaryLogbookList.innerHTML = "";
    valid.forEach((wp, idx) => {
      const isDone = waypointCompletions[idx]?.completed;
      const doneTime = waypointCompletions[idx]?.completedAt || "Not Completed";

      const row = document.createElement("div");
      row.className = "summary-log-row";
      row.innerHTML = `
        <span class="summary-log-title">#${idx + 1} ${wp.title || "Checkpoint"}</span>
        <span class="summary-log-time" style="${!isDone ? 'color:var(--text-sub);' : ''}">${isDone ? `✅ ${doneTime}` : "⏳ Pending"}</span>
      `;
      summaryLogbookList.appendChild(row);
    });
  }

  mobileSummaryModal.style.display = "flex";
}

// Screen Wake Lock Manager
async function requestScreenWakeLock() {
  if ("wakeLock" in navigator) {
    try {
      wakeLockSentinel = await (navigator.wakeLock as any).request("screen");
      showToast("Screen Wake Lock Active.");
    } catch (err: any) {
      console.warn("Screen Wake Lock request failed:", err.message);
    }
  } else {
    showToast("Wake Lock API not supported in this browser.");
  }
}

// Update Header Auth UI Status
function updateAuthUI() {
  const gloveAuthLabel = document.getElementById("glove-auth-label");
  if (pb.authStore.isValid && pb.authStore.model) {
    const user = pb.authStore.model;
    const name = user.email || user.username || "LOGGED IN";
    if (authStatusText) authStatusText.textContent = name.substring(0, 12).toUpperCase();
    if (gloveAuthLabel) gloveAuthLabel.textContent = `LOGGED IN (${name.substring(0, 8)})`;
  } else {
    if (authStatusText) authStatusText.textContent = "SIGN IN";
    if (gloveAuthLabel) gloveAuthLabel.textContent = "SIGN IN";
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
  loadCompletionState();

  const valid = (record.waypoints || []).filter((w) => w.lat !== null && w.lon !== null);
  let firstUncompleted = 0;
  for (let i = 0; i < valid.length; i++) {
    if (!waypointCompletions[i]?.completed) {
      firstUncompleted = i;
      break;
    }
  }
  currentWaypointIndex = firstUncompleted;

  try {
    localStorage.setItem("iterviae_active_mobile_trip", JSON.stringify(record));
  } catch (e) {
    console.warn("Failed to cache trip locally:", e);
  }

  renderDashboardDeck();
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

// Toast Notification Helper
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

// Hero Action Bar Controls
if (btnDashNextStep) {
  btnDashNextStep.addEventListener("click", () => handleHeroNextStep());
}

if (btnDashPrev) {
  btnDashPrev.addEventListener("click", () => {
    triggerHapticFeedback(15);
    if (currentWaypointIndex > 0) {
      currentWaypointIndex--;
      renderDashboardDeck();
    }
  });
}

if (btnDashGmaps) {
  btnDashGmaps.addEventListener("click", () => {
    if (!activeTrip || !activeTrip.waypoints) return;
    const valid = activeTrip.waypoints.filter((w) => w.lat !== null && w.lon !== null);
    if (currentWaypointIndex >= valid.length) return;

    triggerHapticFeedback([20, 30, 20]);
    const wp = valid[currentWaypointIndex];
    showToast(`Launching Google Maps navigation to ${wp.title || "Spot"}...`);

    let originLat: number | undefined;
    let originLon: number | undefined;

    if (currentWaypointIndex > 0 && valid[currentWaypointIndex - 1]?.lat !== null) {
      originLat = valid[currentWaypointIndex - 1].lat!;
      originLon = valid[currentWaypointIndex - 1].lon!;
    }

    openInGoogleMaps(wp.lat!, wp.lon!, originLat, originLon);
  });
}

if (btnReadNotes) {
  btnReadNotes.addEventListener("click", () => {
    triggerHapticFeedback([15, 20]);
    if (!activeTrip || !activeTrip.waypoints) return;
    const valid = activeTrip.waypoints.filter((w) => w.lat !== null && w.lon !== null);
    if (currentWaypointIndex >= valid.length) return;
    const wp = valid[currentWaypointIndex];
    const textToRead = wp.notes || wp.description || wp.briefing || wp.title;
    if (textToRead) speakText(textToRead);
  });
}



// Logbook & Auth Controls
if (summaryModalClose) {
  summaryModalClose.addEventListener("click", () => {
    if (mobileSummaryModal) mobileSummaryModal.style.display = "none";
  });
}

if (summaryCloseBtn) {
  summaryCloseBtn.addEventListener("click", () => {
    if (mobileSummaryModal) mobileSummaryModal.style.display = "none";
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

// Auth Form Listeners
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
    const emailVal = mobileAuthEmail.value.trim();
    const passVal = mobileAuthPassword.value;

    try {
      if (isSignUpMode) {
        await pb.collection("users").create({
          email: emailVal,
          password: passVal,
          passwordConfirm: passVal
        });
        showToast("Account created successfully! Signing in...");
      }

      const authData = await pb.collection("users").authWithPassword(emailVal, passVal);

      showToast(`Welcome back, ${authData.record.email || authData.record.username}!`);
      updateAuthUI();
      if (mobileAuthModal) mobileAuthModal.style.display = "none";

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

// Cockpit Menu Handlers
const mobileGloveModal = document.getElementById("mobile-glove-modal");
const btnOpenGloveControls = document.getElementById("btn-open-glove-controls");
const gloveModalClose = document.getElementById("glove-modal-close");

const gloveBtnFull = document.getElementById("glove-btn-full");
const gloveBtnTrips = document.getElementById("glove-btn-trips");
const gloveBtnAuth = document.getElementById("glove-btn-auth");




if (btnOpenGloveControls) {
  btnOpenGloveControls.addEventListener("click", () => {
    triggerHapticFeedback(15);
    if (mobileGloveModal) mobileGloveModal.style.display = "flex";
  });
}
if (gloveModalClose) {
  gloveModalClose.addEventListener("click", () => {
    triggerHapticFeedback(15);
    if (mobileGloveModal) mobileGloveModal.style.display = "none";
  });
}
if (gloveBtnFull) {
  gloveBtnFull.addEventListener("click", () => {
    triggerHapticFeedback(20);
    if (mobileGloveModal) mobileGloveModal.style.display = "none";
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      const docEl = document.documentElement as any;
      if (docEl.requestFullscreen) docEl.requestFullscreen().catch(() => {});
      else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
      showToast("📺 Fullscreen Engaged!");
    } else {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
      showToast("Fullscreen Exited.");
    }
  });
}

if (gloveBtnTrips) {
  gloveBtnTrips.addEventListener("click", () => {
    triggerHapticFeedback(20);
    if (mobileGloveModal) mobileGloveModal.style.display = "none";
    if (btnOpenTrips) (btnOpenTrips as HTMLElement).click();
  });
}
if (gloveBtnAuth) {
  gloveBtnAuth.addEventListener("click", () => {
    triggerHapticFeedback(20);
    if (mobileGloveModal) mobileGloveModal.style.display = "none";
    if (pb.authStore.isValid) {
      pb.authStore.clear();
      updateAuthUI();
      showToast("Signed out of PocketBase.");
    } else {
      if (mobileAuthModal) mobileAuthModal.style.display = "flex";
    }
  });
}

// Service Worker PWA Registration for Offline Caching
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(
      (reg) => console.log("Iter Viae ServiceWorker registered:", reg.scope),
      (err) => console.warn("Iter Viae ServiceWorker registration failed:", err)
    );
  });
}

// Initialize Application
document.addEventListener("DOMContentLoaded", () => {
  startGPSWatcher();
  requestScreenWakeLock();
  updateAuthUI();
  loadCachedTripLocally();
});
