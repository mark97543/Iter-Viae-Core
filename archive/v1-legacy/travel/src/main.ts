import "./styles.css";
import { Trip, TripStatus, TripSection } from "./types/trip";
import { router, RouteState } from "./router";
import { fetchTripsFromPB, fetchTripBySlugFromPB, saveTripToPB, POCKETBASE_URL, pb } from "./pocketbase";
import { loadLocalFolderTrips } from "./utils/tripLoader";

// Cross-subdomain SSO Token Handler from Hub (wade-usa.com)
(function handleSSOToken() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");
  if (token) {
    try {
      pb.authStore.save(token, null);
      urlParams.delete("token");
      const newQuery = urlParams.toString();
      const newUrl = window.location.pathname + (newQuery ? "?" + newQuery : "") + window.location.hash;
      window.history.replaceState(null, "", newUrl);
    } catch (e) {
      console.warn("Failed to process SSO token from Hub:", e);
    }
  }
})();

console.log("MULTI-TRIP ENGINE — Direct Routing & DB Sync Initialized.");

// State
let trips: Trip[] = loadTrips();
let searchQuery: string = "";
let activeStatusFilter: string = "all";
let currentTrip: Trip | null = null;

// DOM Elements
const dashboardView = document.getElementById("dashboard-view");
const tripDetailView = document.getElementById("trip-detail-view");

const slugCardsGrid = document.getElementById("slug-cards-grid");
const tripSearchInput = document.getElementById("trip-search-input") as HTMLInputElement | null;
const filterBtns = document.querySelectorAll(".filter-btn");

const tripHeaderContainer = document.getElementById("trip-header-container");
const stickyTocBar = document.getElementById("sticky-toc-bar");
const fieldManualSectionsContainer = document.getElementById("field-manual-sections-container");

const btnNavDashboard = document.getElementById("btn-nav-dashboard");
const btnBackToDashboard = document.getElementById("btn-back-to-dashboard");
const headerBrandLink = document.getElementById("header-brand-link");

// Toast Notification
function showToast(message: string) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}

// Purge legacy local storage keys on startup to ensure zero caching issues
localStorage.removeItem("multi_engine_trips_data");
localStorage.removeItem("travel_app_standalone_data");
localStorage.removeItem("travel_pb_cache");

// Helper to merge remote/cached trips with local file-based trips (local trip.json ALWAYS takes priority)
function mergeTrips(remoteTrips: Trip[], localTrips: Trip[]): Trip[] {
  const tripMap = new Map<string, Trip>();
  remoteTrips.forEach((t) => tripMap.set(t.slug, t));
  localTrips.forEach((lTrip) => {
    const existing = tripMap.get(lTrip.slug);
    if (existing) {
      tripMap.set(lTrip.slug, {
        ...existing,
        ...lTrip,
        sections: (lTrip.sections && lTrip.sections.length > 0) ? lTrip.sections : existing.sections
      });
    } else {
      tripMap.set(lTrip.slug, lTrip);
    }
  });
  return Array.from(tripMap.values());
}

// Load Trips from Local Trip Markdown Folders & LocalStorage
function loadTrips(): Trip[] {
  const localFolderTrips = loadLocalFolderTrips();
  const stored = localStorage.getItem("travel_pb_cache");
  if (stored) {
    try {
      const parsed: Trip[] = JSON.parse(stored);
      return mergeTrips(parsed, localFolderTrips);
    } catch (e) {
      console.error("Failed to parse cached travel data", e);
    }
  }
  return localFolderTrips;
}

// Save Trips State Locally
function saveTripsState() {
  localStorage.setItem("travel_pb_cache", JSON.stringify(trips));
}

// Sync strictly with PocketBase DB 'travel' Collection
async function syncWithPocketBaseDB() {
  const localFolderTrips = loadLocalFolderTrips();
  const result = await fetchTripsFromPB();
  if (result.isForbidden) {
    trips = mergeTrips([], localFolderTrips);
    saveTripsState();
    renderRoute(router.getCurrentRoute());
    return;
  }
  if (result.trips) {
    trips = mergeTrips(result.trips, localFolderTrips);
    saveTripsState();
    renderRoute(router.getCurrentRoute());
  }
}

// Subscribe to Router Route Changes
router.subscribe((route: RouteState) => {
  renderRoute(route);
});

// Render Route State
async function renderRoute(route: RouteState) {
  if (route.view === "dashboard" || !route.slug) {
    currentTrip = null;
    if (dashboardView) dashboardView.style.display = "block";
    if (tripDetailView) tripDetailView.style.display = "none";
    if (btnNavDashboard) btnNavDashboard.classList.add("chip-active");
    renderDashboardGrid();
  } else if (route.view === "trip" && route.slug) {
    let found = trips.find((t) => t.slug.toLowerCase() === route.slug?.toLowerCase());

    // Fallback: Query PocketBase DB directly if not in local cache
    if (!found) {
      const pbTrip = await fetchTripBySlugFromPB(route.slug);
      if (pbTrip) {
        found = pbTrip;
        trips.unshift(pbTrip);
        saveTripsState();
      }
    }

    if (found) {
      currentTrip = found;
      if (dashboardView) dashboardView.style.display = "none";
      if (tripDetailView) tripDetailView.style.display = "block";
      if (btnNavDashboard) btnNavDashboard.classList.remove("chip-active");
      renderTripFieldManual(found);
    } else {
      showToast(`⚠️ Trip slug "/trips/${route.slug}" not found. Directing to Dashboard.`);
      router.navigateToDashboard();
    }
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// RENDER VIEW 1: MASTER CONTROL DASHBOARD
function renderDashboardGrid() {
  if (!slugCardsGrid) return;
  slugCardsGrid.innerHTML = "";

  const q = searchQuery.toLowerCase().trim();
  const filtered = trips.filter((t) => {
    const matchesSearch =
      !q ||
      t.title.toLowerCase().includes(q) ||
      t.slug.toLowerCase().includes(q) ||
      t.destination.toLowerCase().includes(q) ||
      t.summary.toLowerCase().includes(q);

    const matchesStatus =
      activeStatusFilter === "all" || t.status.toLowerCase() === activeStatusFilter.toLowerCase();

    return matchesSearch && matchesStatus;
  });

  filtered.forEach((trip) => {
    const card = document.createElement("div");
    card.className = "slug-card";
    card.addEventListener("click", () => {
      router.navigateToTrip(trip.slug);
    });

    const statusClass = `status-${trip.status}`;

    card.innerHTML = `
      <div class="slug-card-cover" style="background: ${trip.coverGradient}">
        <div class="cover-badge-row" style="align-items: flex-start;">
          <h3 class="slug-card-title-top">${trip.title}</h3>
          <span class="status-badge ${statusClass}">${trip.status}</span>
        </div>
        <div style="display:flex; justify-content:flex-end; align-items:flex-end;">
          <div class="slug-card-dates">${trip.dates}</div>
        </div>
      </div>
      <div class="slug-card-body">
        <div>
          <p class="slug-card-subtitle">${trip.subtitle || trip.destination}</p>
          <p class="slug-card-summary">${trip.summary}</p>
        </div>
        <div>
          <div class="slug-card-stats">
            ${trip.stats?.days ? `<span class="stat-chip">📅 ${trip.stats.days} Days</span>` : ""}
            ${trip.stats?.travelers ? `<span class="stat-chip">👥 ${trip.stats.travelers} Travelers</span>` : ""}
            ${trip.stats?.season ? `<span class="stat-chip">🌤️ ${trip.stats.season}</span>` : ""}
          </div>
          <button class="slug-card-btn">
            Open Itinerary &rarr;
          </button>
        </div>
      </div>
    `;

    slugCardsGrid.appendChild(card);
  });
}

// Filter Status Buttons Listener
filterBtns.forEach((btn) => {
  btn.addEventListener("click", (e) => {
    filterBtns.forEach((b) => b.classList.remove("active"));
    const target = e.target as HTMLElement;
    target.classList.add("active");
    activeStatusFilter = target.getAttribute("data-status") || "all";
    renderDashboardGrid();
  });
});

// Search Box Listener
if (tripSearchInput) {
  tripSearchInput.addEventListener("input", (e) => {
    searchQuery = (e.target as HTMLInputElement).value;
    renderDashboardGrid();
  });
}

// RENDER VIEW 2: DIRECT TRIP FIELD MANUAL VIEW
function renderTripFieldManual(trip: Trip) {
  // Render Header Card

  // Render Header Card
  // Render Header Card
  if (tripHeaderContainer) {
    const statusClass = `status-${trip.status}`;
    tripHeaderContainer.innerHTML = `
      <div class="slug-header-card" style="background: ${trip.coverGradient}">
        <div class="slug-header-top">
          <span class="status-badge ${statusClass}">${trip.status}</span>
        </div>
        <h1 class="slug-header-title">${trip.title}</h1>
        <p class="slug-header-sub">${trip.subtitle || trip.destination}</p>
        ${trip.summary ? `<p class="slug-header-summary">${trip.summary}</p>` : ""}
        <div class="slug-header-stats-row">
          <span class="header-stat-badge">🗓️ ${trip.dates}</span>
          ${trip.stats?.days ? `<span class="header-stat-badge">📅 ${trip.stats.days} Days</span>` : ""}
          ${trip.stats?.travelers ? `<span class="header-stat-badge">👥 ${trip.stats.travelers} Travelers</span>` : ""}
        </div>
      </div>
    `;
  }

  // Provide default field book sections if none exist yet on trip
  const activeSections: TripSection[] = (trip.sections && trip.sections.length > 0) ? trip.sections : [
    {
      slug: "flight-ops",
      title: "Flight Operations & Staging",
      icon: "✈️",
      content: `
        <p>Check-in opens 3 hours prior to departure. Ensure all physical passports have at least 6 months validity remaining from date of entry.</p>
        <ul>
          <li><strong>Baggage Allowance:</strong> 2x 23kg Checked Bags + 1 Carry-on item per traveler.</li>
          <li><strong>E-Visa / Arrival Form:</strong> Digital QR codes saved offline on mobile devices.</li>
        </ul>
      `
    },
    {
      slug: "changi-gauntlet",
      title: "Singapore Changi Layover",
      icon: "🇸🇬",
      content: `
        <p>During the Changi layover, follow transit signs directly to Terminal 1/2 for the Jewel Rain Vortex.</p>
        <ul>
          <li><strong>Jewel Rain Vortex Light Show:</strong> Operates hourly until 10:00 PM.</li>
          <li><strong>SATS Ambassador Lounge:</strong> Terminal 3 Level 3 (Free shower & buffet access).</li>
          <li><strong>Staging Gate:</strong> Boarding gate closes 20 minutes prior to final departure.</li>
        </ul>
      `
    },
    {
      slug: "table-tactics",
      title: "Table Tactics & Food Ops",
      icon: "🍜",
      content: `
        <p>Always order bottled water with ice. Street food stalls with high local turnover are the safest and best.</p>
        <div class="field-callout-box">
          <strong>Essential Phrases:</strong><br/>
          • <em>"Mai Phet"</em> (ไม่เผ็ด) = Not Spicy<br/>
          • <em>"Phet Noi"</em> (เผ็ดน้อย) = Slightly Spicy<br/>
          • <em>"Aroy Mak"</em> (อร่อยมาก) = Delicious!
        </div>
      `
    },
    {
      slug: "beer-rosetta",
      title: "Beer Rosetta Stone & Heineken Rule",
      icon: "🍺",
      content: `
        <p>Note: Legal alcohol sales hours in Thailand are strictly <strong>11:00 AM – 2:00 PM</strong> and <strong>5:00 PM – Midnight</strong>.</p>
        <table class="field-rosetta-table">
          <thead>
            <tr><th>Brand</th><th>Style</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td><strong>Singha (สิงห์)</strong></td><td>Lager (5.0%)</td><td>Full-bodied original Thai pilsner. Best with spicy dishes.</td></tr>
            <tr><td><strong>Chang (ช้าง)</strong></td><td>Classic (5.0%)</td><td>Crisp rice lager. Served over ice ("Nam Kheng").</td></tr>
            <tr><td><strong>Leo (ลีโอ)</strong></td><td>Smooth Lager</td><td>Most popular local choice, light & easy drinking.</td></tr>
          </tbody>
        </table>
      `
    },
    {
      slug: "emergency-cards",
      title: "Emergency Flashcards (Thai Script)",
      icon: "🚑",
      content: `
        <p>Show these full-screen flashcards to taxi drivers, hotel concierges, or emergency responders:</p>
        <div class="flashcards-grid">
          <div class="flashcard-item">
            <div class="flashcard-th">กรุณาเปิดมิเตอร์ด้วยครับ</div>
            <div class="flashcard-en">"Please turn on the meter" (Taxi)</div>
          </div>
          <div class="flashcard-item">
            <div class="flashcard-th">ช่วยพาไปส่งที่โรงแรมหน่อยครับ</div>
            <div class="flashcard-en">"Please take me to the hotel"</div>
          </div>
          <div class="flashcard-item">
            <div class="flashcard-th">ไม่ใส่ผงชูรส และ ไม่เผ็ด</div>
            <div class="flashcard-en">"No MSG and Not Spicy"</div>
          </div>
        </div>
      `
    }
  ];

  // Render Sticky Table of Contents Sidebar
  if (stickyTocBar) {
    stickyTocBar.innerHTML = `
      <div class="toc-sidebar-header">
        <span>📖</span>
        <span>CONTENTS</span>
      </div>
      ${activeSections.map((sec) => `
        <button class="toc-chip" data-target="section-${sec.slug}">
          ${sec.icon ? `<span>${sec.icon}</span>` : ""}
          <span>${sec.title}</span>
        </button>
      `).join("")}
    `;

    stickyTocBar.querySelectorAll(".toc-chip").forEach((chip) => {
      chip.addEventListener("click", (e) => {
        const targetId = (e.currentTarget as HTMLElement).getAttribute("data-target");
        if (targetId) {
          const targetEl = document.getElementById(targetId);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
            stickyTocBar.querySelectorAll(".toc-chip").forEach((c) => c.classList.remove("active"));
            (e.currentTarget as HTMLElement).classList.add("active");
          }
        }
      });
    });
  }

  // Render Field Manual Continuous Sections
  if (fieldManualSectionsContainer) {
    fieldManualSectionsContainer.innerHTML = activeSections.map((sec) => `
      <div class="field-manual-section-card" id="section-${sec.slug}">
        <div class="section-card-header">
          <div class="section-card-title-group">
            ${sec.icon ? `<span class="section-card-icon">${sec.icon}</span>` : ""}
            <h2 class="section-card-title">${sec.title}</h2>
          </div>
        </div>
        <div class="section-card-body">
          ${sec.content}
        </div>
      </div>
    `).join("");
  }
}

// Top Nav & Back Handlers
if (btnNavDashboard) btnNavDashboard.addEventListener("click", () => router.navigateToDashboard());
if (btnBackToDashboard) btnBackToDashboard.addEventListener("click", () => router.navigateToDashboard());
if (headerBrandLink) headerBrandLink.addEventListener("click", () => router.navigateToDashboard());

// Intercept in-page section & subsection anchor links (#...) to prevent SPA hash routing collisions
document.addEventListener("click", (e) => {
  const target = (e.target as HTMLElement).closest("a");
  if (!target) return;

  const href = target.getAttribute("href");
  if (href && href.startsWith("#")) {
    const rawTarget = href.replace(/^#\/?/, "");
    if (!rawTarget) return;

    // Check for exact element ID first (e.g. #table-tactics or #custom-line), then fallback to section card ID
    const targetEl =
      document.getElementById(rawTarget) ||
      document.getElementById(`section-${rawTarget}`);

    if (targetEl) {
      e.preventDefault();
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });

      const sectionId = targetEl.id.startsWith("section-")
        ? targetEl.id
        : targetEl.closest(".field-manual-section-card")?.id;

      if (sectionId && stickyTocBar) {
        stickyTocBar.querySelectorAll(".toc-chip").forEach((c) => c.classList.remove("active"));
        const activeChip = stickyTocBar.querySelector(`[data-target="${sectionId}"]`);
        if (activeChip) activeChip.classList.add("active");
      }
    }
  }
});

// Initial Route Execution & Async DB Sync
const initialRoute = router.getCurrentRoute();
renderRoute(initialRoute);
syncWithPocketBaseDB();
