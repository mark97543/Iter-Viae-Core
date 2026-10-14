import "./styles.css";
import { Editor, Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import {
  Trip,
  FlightBooking,
  HotelBooking,
  RentalCarBooking,
  ActivityBooking
} from "./types/trip";
import { router, RouteState } from "./router";
import {
  fetchTripsFromPB,
  fetchTripBySlugFromPB,
  fetchTripByIdFromPB,
  saveTripToPB,
  pb
} from "./pocketbase";

// Custom TipTap Extensions for Field Callouts
const CalloutBox = Node.create({
  name: "calloutBox",
  group: "block",
  content: "block+",
  defining: true,
  parseHTML() {
    return [{ tag: "div.field-callout-box" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "field-callout-box" }), 0];
  },
});

// Cross-subdomain SSO Token & Hub Trip Launch Handler
(function handleSSOToken() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");
  const tripId = urlParams.get("tripId") || urlParams.get("trip");

  if (token) {
    try {
      pb.authStore.save(token, null);
      if (pb.authStore.isValid) {
        pb.collection("users").authRefresh().then(authData => {
          pb.authStore.save(authData.token, authData.record);
        }).catch(e => console.warn("Notice refreshing travel auth record:", e));
      }
    } catch (e) {
      console.warn("Failed to save cross-domain SSO token:", e);
    }
  }

  if (tripId) {
    setTimeout(async () => {
      let trip = await fetchTripByIdFromPB(tripId);
      if (!trip) trip = await fetchTripBySlugFromPB(tripId);
      if (trip) {
        router.navigateToTrip(trip.slug);
      }
    }, 150);
  }
})();

// State
let trips: Trip[] = [];
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
const btnBackToDashboard = document.getElementById("btn-back-to-dashboard");
const headerBrandLink = document.getElementById("header-brand-link");

export function getHubUrl(): string {
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  return isLocal ? "http://localhost:3000/" : "https://wade-usa.com/";
}

// Update Hub Portal Links
const hubUrl = getHubUrl();
const btnBackToHubHeader = document.getElementById("btn-back-to-hub-header") as HTMLAnchorElement | null;
const btnBackToHubDetail = document.getElementById("btn-back-to-hub-detail") as HTMLAnchorElement | null;
if (btnBackToHubHeader) btnBackToHubHeader.href = hubUrl;
if (btnBackToHubDetail) btnBackToHubDetail.href = hubUrl;

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

function escapeHtml(str: string): string {
  if (!str) return "";
  return str.replace(/[&<>"']/g, (m) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m] || m;
  });
}

function copyToClipboard(text: string, label: string = "Code") {
  if (!text) return;
  navigator.clipboard.writeText(text).then(
    () => showToast(`📋 Copied ${label}: ${text}`),
    () => showToast(`Failed to copy to clipboard`)
  );
}

// Router subscription
router.subscribe((route: RouteState) => {
  renderRoute(route);
});

async function renderRoute(route: RouteState) {
  if (route.view === "dashboard" || !route.slug) {
    currentTrip = null;
    if (dashboardView) dashboardView.style.display = "block";
    if (tripDetailView) tripDetailView.style.display = "none";
    renderDashboardGrid();
  } else if (route.view === "trip" && route.slug) {
    let found = trips.find(
      (t) => t.id === route.slug || t.slug.toLowerCase() === route.slug?.toLowerCase()
    );

    if (!found) {
      let pbTrip = await fetchTripBySlugFromPB(route.slug);
      if (!pbTrip) {
        pbTrip = await fetchTripByIdFromPB(route.slug);
      }
      if (pbTrip) {
        found = pbTrip;
        trips.unshift(pbTrip);
      }
    }

    if (found) {
      currentTrip = found;
      if (dashboardView) dashboardView.style.display = "none";
      if (tripDetailView) tripDetailView.style.display = "block";
      renderTripDossier(found);
    } else {
      showToast(`⚠️ Trip "${route.slug}" not found.`);
      router.navigateToDashboard();
    }
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// -----------------------------------------------------------------------------
// VIEW 1: MASTER CONTROL DASHBOARD
// -----------------------------------------------------------------------------
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

  if (filtered.length === 0) {
    slugCardsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1.5rem;">
        <div style="font-size: 3rem; margin-bottom: 0.5rem;">✈️</div>
        <h3 style="font-size: 1.25rem; font-weight: 800; color: #fff;">No Travel Plans Found</h3>
        <p style="color: var(--text-muted); font-size: 0.9rem;">No travel itineraries match your search or filter.</p>
      </div>
    `;
    return;
  }

  filtered.forEach((trip) => {
    const card = document.createElement("div");
    card.className = "slug-card";
    card.addEventListener("click", () => {
      router.navigateToTrip(trip.slug);
    });

    const statusClass = `status-${trip.status}`;
    const totalCost = calculateTotalBookingsCost(trip);

    card.innerHTML = `
      <div class="slug-card-cover" style="background: ${trip.coverGradient}">
        <div class="cover-badge-row" style="align-items: flex-start;">
          <h3 class="slug-card-title-top">${escapeHtml(trip.title)}</h3>
          <span class="status-badge ${statusClass}">${trip.status}</span>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:flex-end; width:100%;">
          <div class="slug-card-dates">${escapeHtml(trip.dates)}</div>
          ${totalCost > 0 ? `<div style="font-family:var(--font-mono); font-size:0.85rem; font-weight:800; color:#10b981; background:rgba(0,0,0,0.5); padding:2px 8px; border-radius:6px;">💵 $${totalCost.toLocaleString()}</div>` : ""}
        </div>
      </div>
      <div class="slug-card-body">
        <div>
          <p class="slug-card-subtitle">${escapeHtml(trip.subtitle || trip.destination)}</p>
          <p class="slug-card-summary">${escapeHtml(trip.summary)}</p>
        </div>
        <div>
          <div class="slug-card-stats">
            <span class="stat-chip">✈️ ${(trip.bookings?.flights || []).length} Flights</span>
            <span class="stat-chip">🏨 ${(trip.bookings?.hotels || []).length} Hotels</span>
            <span class="stat-chip">🚗 ${(trip.bookings?.rentalCars || []).length} Cars</span>
            <span class="stat-chip">🎟️ ${(trip.bookings?.activities || []).length} Acts</span>
          </div>
          <button class="slug-card-btn">
            Open Dossier &rarr;
          </button>
        </div>
      </div>
    `;

    slugCardsGrid.appendChild(card);
  });
}

// -----------------------------------------------------------------------------
// VIEW 2: TRAVEL MASTER DOSSIER (Bookings + Notes)
// -----------------------------------------------------------------------------
function calculateTotalBookingsCost(trip: Trip): number {
  if (!trip.bookings) return trip.budget || 0;
  const flightsCost = (trip.bookings.flights || []).reduce((sum, f) => sum + (Number(f.cost) || 0), 0);
  const hotelsCost = (trip.bookings.hotels || []).reduce((sum, h) => sum + (Number(h.cost) || 0), 0);
  const carsCost = (trip.bookings.rentalCars || []).reduce((sum, c) => sum + (Number(c.cost) || 0), 0);
  const activitiesCost = (trip.bookings.activities || []).reduce((sum, a) => sum + (Number(a.cost) || 0), 0);
  return flightsCost + hotelsCost + carsCost + activitiesCost;
}

function renderTripDossier(trip: Trip) {
  renderTripHeader(trip);
  updateCategoryNavCounts(trip);
  renderFlightsSection(trip);
  renderHotelsSection(trip);
  renderRentalCarsSection(trip);
  renderActivitiesSection(trip);
  renderNotesSection(trip);
}

function renderTripHeader(trip: Trip) {
  if (!tripHeaderContainer) return;

  const totalCost = calculateTotalBookingsCost(trip);
  const days = trip.stats?.days || 1;

  tripHeaderContainer.innerHTML = `
    <div class="slug-header-card" style="background: ${trip.coverGradient}; position: relative; border-radius: var(--radius-lg); padding: 2rem 2.25rem; margin-bottom: 1.5rem; box-shadow: var(--shadow-card);">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem;">
        <span class="header-status-pill status-${trip.status}">${trip.status.toUpperCase()} TRAVEL PLAN</span>
        <button id="btn-edit-header-card" class="btn-back" style="background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(8px); border-color: rgba(255,255,255,0.2); color: #fff; padding: 6px 14px; font-size: 0.82rem;">
          ✏️ Edit Details
        </button>
      </div>
      <h1 class="slug-header-title" style="font-size: 2.2rem; font-weight: 900; margin-bottom: 0.25rem; color: #fff; letter-spacing: -0.02em;">${escapeHtml(trip.title)}</h1>
      <p class="slug-header-sub" style="font-size: 1.1rem; color: rgba(255, 255, 255, 0.85); font-weight: 500; margin-bottom: 0.75rem;">${escapeHtml(trip.subtitle || trip.destination)}</p>
      ${trip.summary ? `<p class="slug-header-summary" style="font-size: 0.92rem; color: rgba(255, 255, 255, 0.75); max-width: 720px; line-height: 1.5; margin-bottom: 1rem;">${escapeHtml(trip.summary)}</p>` : ""}
      
      <div class="slug-header-stats-row" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 1rem;">
        <span class="header-stat-badge" style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(255,255,255,0.15); color: #fff; padding: 4px 12px; border-radius: 8px; font-size: 0.85rem; font-weight: 600;">🗓️ ${escapeHtml(trip.dates)}</span>
        <span class="header-stat-badge" style="background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(255,255,255,0.15); color: #fbbf24; padding: 4px 12px; border-radius: 8px; font-size: 0.85rem; font-weight: 700;">📅 ${days} ${days === 1 ? 'Day' : 'Days'}</span>
        <span class="header-stat-badge" style="background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); color: #34d399; padding: 4px 12px; border-radius: 8px; font-size: 0.85rem; font-weight: 800; font-family: var(--font-mono);">💰 Total Bookings: $${totalCost.toLocaleString()}</span>
      </div>
    </div>
  `;

  tripHeaderContainer.querySelector("#btn-edit-header-card")?.addEventListener("click", () => {
    openTripHeaderModal();
  });
}

function updateCategoryNavCounts(trip: Trip) {
  const flightsCount = document.getElementById("count-flights");
  const hotelsCount = document.getElementById("count-hotels");
  const carsCount = document.getElementById("count-cars");
  const activitiesCount = document.getElementById("count-activities");

  if (flightsCount) flightsCount.textContent = String((trip.bookings?.flights || []).length);
  if (hotelsCount) hotelsCount.textContent = String((trip.bookings?.hotels || []).length);
  if (carsCount) carsCount.textContent = String((trip.bookings?.rentalCars || []).length);
  if (activitiesCount) activitiesCount.textContent = String((trip.bookings?.activities || []).length);
}

// -----------------------------------------------------------------------------
// CATEGORY 1: FLIGHTS
// -----------------------------------------------------------------------------
function renderFlightsSection(trip: Trip) {
  const container = document.getElementById("flights-list-container");
  if (!container) return;

  const flights: FlightBooking[] = trip.bookings?.flights || [];

  if (flights.length === 0) {
    container.innerHTML = `
      <div class="empty-booking-card">
        <div class="empty-booking-icon">✈️</div>
        <h3>No Flights Added Yet</h3>
        <p>Keep flight routes, times, confirmation codes, and boarding passes in one place.</p>
        <button class="btn-primary btn-add-flight-trigger" style="margin-top: 6px; padding: 6px 14px; font-size: 0.82rem;">➕ Add First Flight</button>
      </div>
    `;
    container.querySelector(".btn-add-flight-trigger")?.addEventListener("click", () => openFlightModal());
    return;
  }

  container.innerHTML = "";
  flights.forEach((flight) => {
    const card = document.createElement("div");
    card.className = "booking-card";

    const routeDisplay = flight.departureAirport || flight.arrivalAirport
      ? `${escapeHtml(flight.departureAirport || "TBD")} ➔ ${escapeHtml(flight.arrivalAirport || "TBD")}`
      : escapeHtml(flight.airline);

    card.innerHTML = `
      <div class="booking-card-top">
        <div>
          <div class="booking-route-display">✈️ ${routeDisplay}</div>
          <div style="font-size: 0.95rem; font-weight: 700; color: #fff; margin-top: 2px;">
            ${escapeHtml(flight.airline)} ${escapeHtml(flight.flightNumber)}
          </div>
        </div>
        ${flight.cost && flight.cost > 0 ? `<div class="booking-cost-tag">💵 $${flight.cost.toLocaleString()}</div>` : ""}
      </div>

      ${flight.confirmationCode ? `
        <div class="booking-code-row">
          <span style="font-size: 0.76rem; color: var(--text-muted); font-weight: 600;">CONFIRMATION:</span>
          <span class="booking-code-badge">${escapeHtml(flight.confirmationCode)}</span>
          <button class="btn-copy-code" data-code="${escapeHtml(flight.confirmationCode)}">📋 Copy</button>
        </div>
      ` : ""}

      <div class="booking-meta-list">
        ${flight.departureDateTime ? `<div class="booking-meta-item">🛫 <span>Departs: <b>${escapeHtml(flight.departureDateTime)}</b></span></div>` : ""}
        ${flight.arrivalDateTime ? `<div class="booking-meta-item">🛬 <span>Arrives: <b>${escapeHtml(flight.arrivalDateTime)}</b></span></div>` : ""}
        ${flight.seats ? `<div class="booking-meta-item">💺 <span>Seat(s): <b>${escapeHtml(flight.seats)}</b></span></div>` : ""}
        ${flight.terminalGate ? `<div class="booking-meta-item">🚪 <span>${escapeHtml(flight.terminalGate)}</span></div>` : ""}
      </div>

      ${flight.notes ? `<div class="booking-notes-box">📝 ${escapeHtml(flight.notes)}</div>` : ""}

      <div class="booking-card-footer">
        <span style="font-size: 0.74rem; color: var(--text-muted); font-family: var(--font-mono);">FLIGHT BOOKING</span>
        <div class="booking-card-actions">
          <button class="btn-back btn-edit-flight" data-id="${flight.id}" style="padding: 4px 10px; font-size: 0.75rem;">✏️ Edit</button>
          <button class="btn-back btn-delete-flight" data-id="${flight.id}" style="padding: 4px 10px; font-size: 0.75rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">🗑️</button>
        </div>
      </div>
    `;

    card.querySelector(".btn-copy-code")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const code = (e.currentTarget as HTMLElement).getAttribute("data-code") || "";
      copyToClipboard(code, "Flight Confirmation Code");
    });

    card.querySelector(".btn-edit-flight")?.addEventListener("click", () => {
      openFlightModal(flight);
    });

    card.querySelector(".btn-delete-flight")?.addEventListener("click", () => {
      deleteFlight(flight.id);
    });

    container.appendChild(card);
  });
}

// -----------------------------------------------------------------------------
// CATEGORY 2: HOTELS & LODGING
// -----------------------------------------------------------------------------
function renderHotelsSection(trip: Trip) {
  const container = document.getElementById("hotels-list-container");
  if (!container) return;

  const hotels: HotelBooking[] = trip.bookings?.hotels || [];

  if (hotels.length === 0) {
    container.innerHTML = `
      <div class="empty-booking-card">
        <div class="empty-booking-icon">🏨</div>
        <h3>No Hotels or Lodging Added Yet</h3>
        <p>Store hotel bookings, check-in dates, addresses, and room codes for easy check-in.</p>
        <button class="btn-primary btn-add-hotel-trigger" style="margin-top: 6px; padding: 6px 14px; font-size: 0.82rem;">➕ Add First Hotel</button>
      </div>
    `;
    container.querySelector(".btn-add-hotel-trigger")?.addEventListener("click", () => openHotelModal());
    return;
  }

  container.innerHTML = "";
  hotels.forEach((hotel) => {
    const card = document.createElement("div");
    card.className = "booking-card";

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hotel.name + " " + (hotel.address || ""))}`;

    card.innerHTML = `
      <div class="booking-card-top">
        <div>
          <div class="booking-card-title">🏨 ${escapeHtml(hotel.name)}</div>
          ${hotel.address ? `<div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">📍 <a href="${mapsUrl}" target="_blank" rel="noopener" style="color: var(--accent-cyan); text-decoration: none;">${escapeHtml(hotel.address)} ↗</a></div>` : ""}
        </div>
        ${hotel.cost && hotel.cost > 0 ? `<div class="booking-cost-tag">💵 $${hotel.cost.toLocaleString()}</div>` : ""}
      </div>

      ${hotel.confirmationCode ? `
        <div class="booking-code-row">
          <span style="font-size: 0.76rem; color: var(--text-muted); font-weight: 600;">CONFIRMATION:</span>
          <span class="booking-code-badge">${escapeHtml(hotel.confirmationCode)}</span>
          <button class="btn-copy-code" data-code="${escapeHtml(hotel.confirmationCode)}">📋 Copy</button>
        </div>
      ` : ""}

      <div class="booking-meta-list">
        ${hotel.checkInDate ? `<div class="booking-meta-item">🔑 <span>Check-in: <b>${escapeHtml(hotel.checkInDate)}${hotel.checkInTime ? ` (${escapeHtml(hotel.checkInTime)})` : ""}</b></span></div>` : ""}
        ${hotel.checkOutDate ? `<div class="booking-meta-item">🚪 <span>Check-out: <b>${escapeHtml(hotel.checkOutDate)}${hotel.checkOutTime ? ` (${escapeHtml(hotel.checkOutTime)})` : ""}</b></span></div>` : ""}
        ${hotel.roomType ? `<div class="booking-meta-item">🛏️ <span>Room: <b>${escapeHtml(hotel.roomType)}</b></span></div>` : ""}
      </div>

      ${hotel.notes ? `<div class="booking-notes-box">📝 ${escapeHtml(hotel.notes)}</div>` : ""}

      <div class="booking-card-footer">
        <span style="font-size: 0.74rem; color: var(--text-muted); font-family: var(--font-mono);">HOTEL RESERVATION</span>
        <div class="booking-card-actions">
          <button class="btn-back btn-edit-hotel" data-id="${hotel.id}" style="padding: 4px 10px; font-size: 0.75rem;">✏️ Edit</button>
          <button class="btn-back btn-delete-hotel" data-id="${hotel.id}" style="padding: 4px 10px; font-size: 0.75rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">🗑️</button>
        </div>
      </div>
    `;

    card.querySelector(".btn-copy-code")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const code = (e.currentTarget as HTMLElement).getAttribute("data-code") || "";
      copyToClipboard(code, "Hotel Confirmation Code");
    });

    card.querySelector(".btn-edit-hotel")?.addEventListener("click", () => {
      openHotelModal(hotel);
    });

    card.querySelector(".btn-delete-hotel")?.addEventListener("click", () => {
      deleteHotel(hotel.id);
    });

    container.appendChild(card);
  });
}

// -----------------------------------------------------------------------------
// CATEGORY 3: RENTAL CARS
// -----------------------------------------------------------------------------
function renderRentalCarsSection(trip: Trip) {
  const container = document.getElementById("cars-list-container");
  if (!container) return;

  const cars: RentalCarBooking[] = trip.bookings?.rentalCars || [];

  if (cars.length === 0) {
    container.innerHTML = `
      <div class="empty-booking-card">
        <div class="empty-booking-icon">🚗</div>
        <h3>No Rental Cars Added Yet</h3>
        <p>Save rental counters, pick-up times, toll passes, and vehicle reservation numbers.</p>
        <button class="btn-primary btn-add-car-trigger" style="margin-top: 6px; padding: 6px 14px; font-size: 0.82rem;">➕ Add Rental Car</button>
      </div>
    `;
    container.querySelector(".btn-add-car-trigger")?.addEventListener("click", () => openCarModal());
    return;
  }

  container.innerHTML = "";
  cars.forEach((car) => {
    const card = document.createElement("div");
    card.className = "booking-card";

    card.innerHTML = `
      <div class="booking-card-top">
        <div>
          <div class="booking-card-title">🚗 ${escapeHtml(car.provider)}</div>
          ${car.vehicleType ? `<div style="font-size: 0.84rem; color: var(--accent-cyan); font-weight: 600; margin-top: 2px;">${escapeHtml(car.vehicleType)}</div>` : ""}
        </div>
        ${car.cost && car.cost > 0 ? `<div class="booking-cost-tag">💵 $${car.cost.toLocaleString()}</div>` : ""}
      </div>

      ${car.confirmationCode ? `
        <div class="booking-code-row">
          <span style="font-size: 0.76rem; color: var(--text-muted); font-weight: 600;">CONFIRMATION:</span>
          <span class="booking-code-badge">${escapeHtml(car.confirmationCode)}</span>
          <button class="btn-copy-code" data-code="${escapeHtml(car.confirmationCode)}">📋 Copy</button>
        </div>
      ` : ""}

      <div class="booking-meta-list">
        ${car.pickupLocation || car.pickupDateTime ? `
          <div class="booking-meta-item">
            📍 <span>Pick-up: <b>${escapeHtml(car.pickupLocation || "")}</b> ${car.pickupDateTime ? `(${escapeHtml(car.pickupDateTime)})` : ""}</span>
          </div>
        ` : ""}
        ${car.dropoffLocation || car.dropoffDateTime ? `
          <div class="booking-meta-item">
            🏁 <span>Drop-off: <b>${escapeHtml(car.dropoffLocation || "")}</b> ${car.dropoffDateTime ? `(${escapeHtml(car.dropoffDateTime)})` : ""}</span>
          </div>
        ` : ""}
      </div>

      ${car.notes ? `<div class="booking-notes-box">📝 ${escapeHtml(car.notes)}</div>` : ""}

      <div class="booking-card-footer">
        <span style="font-size: 0.74rem; color: var(--text-muted); font-family: var(--font-mono);">RENTAL CAR</span>
        <div class="booking-card-actions">
          <button class="btn-back btn-edit-car" data-id="${car.id}" style="padding: 4px 10px; font-size: 0.75rem;">✏️ Edit</button>
          <button class="btn-back btn-delete-car" data-id="${car.id}" style="padding: 4px 10px; font-size: 0.75rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">🗑️</button>
        </div>
      </div>
    `;

    card.querySelector(".btn-copy-code")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const code = (e.currentTarget as HTMLElement).getAttribute("data-code") || "";
      copyToClipboard(code, "Rental Car Confirmation Code");
    });

    card.querySelector(".btn-edit-car")?.addEventListener("click", () => {
      openCarModal(car);
    });

    card.querySelector(".btn-delete-car")?.addEventListener("click", () => {
      deleteCar(car.id);
    });

    container.appendChild(card);
  });
}

// -----------------------------------------------------------------------------
// CATEGORY 4: ACTIVITIES & PASSES
// -----------------------------------------------------------------------------
function renderActivitiesSection(trip: Trip) {
  const container = document.getElementById("activities-list-container");
  if (!container) return;

  const activities: ActivityBooking[] = trip.bookings?.activities || [];

  if (activities.length === 0) {
    container.innerHTML = `
      <div class="empty-booking-card">
        <div class="empty-booking-icon">🎟️</div>
        <h3>No Activities or Passes Added Yet</h3>
        <p>Track museum admissions, boat charters, guided tours, and event tickets.</p>
        <button class="btn-primary btn-add-act-trigger" style="margin-top: 6px; padding: 6px 14px; font-size: 0.82rem;">➕ Add Activity</button>
      </div>
    `;
    container.querySelector(".btn-add-act-trigger")?.addEventListener("click", () => openActivityModal());
    return;
  }

  container.innerHTML = "";
  activities.forEach((act) => {
    const card = document.createElement("div");
    card.className = "booking-card";

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(act.title + " " + (act.location || ""))}`;

    card.innerHTML = `
      <div class="booking-card-top">
        <div>
          <div class="booking-card-title">🎟️ ${escapeHtml(act.title)}</div>
          ${act.location ? `<div style="font-size: 0.82rem; color: var(--text-muted); margin-top: 2px;">📍 <a href="${mapsUrl}" target="_blank" rel="noopener" style="color: var(--accent-cyan); text-decoration: none;">${escapeHtml(act.location)} ↗</a></div>` : ""}
        </div>
        ${act.cost && act.cost > 0 ? `<div class="booking-cost-tag">💵 $${act.cost.toLocaleString()}</div>` : ""}
      </div>

      ${act.confirmationCode ? `
        <div class="booking-code-row">
          <span style="font-size: 0.76rem; color: var(--text-muted); font-weight: 600;">TICKET / CODE:</span>
          <span class="booking-code-badge">${escapeHtml(act.confirmationCode)}</span>
          <button class="btn-copy-code" data-code="${escapeHtml(act.confirmationCode)}">📋 Copy</button>
        </div>
      ` : ""}

      <div class="booking-meta-list">
        ${act.dateTime ? `<div class="booking-meta-item">🕒 <span>Scheduled: <b>${escapeHtml(act.dateTime)}</b></span></div>` : ""}
      </div>

      ${act.notes ? `<div class="booking-notes-box">📝 ${escapeHtml(act.notes)}</div>` : ""}

      <div class="booking-card-footer">
        <span style="font-size: 0.74rem; color: var(--text-muted); font-family: var(--font-mono);">ACTIVITY / TICKET</span>
        <div class="booking-card-actions">
          <button class="btn-back btn-edit-act" data-id="${act.id}" style="padding: 4px 10px; font-size: 0.75rem;">✏️ Edit</button>
          <button class="btn-back btn-delete-act" data-id="${act.id}" style="padding: 4px 10px; font-size: 0.75rem; color: #ef4444; border-color: rgba(239, 68, 68, 0.3);">🗑️</button>
        </div>
      </div>
    `;

    card.querySelector(".btn-copy-code")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const code = (e.currentTarget as HTMLElement).getAttribute("data-code") || "";
      copyToClipboard(code, "Ticket Confirmation Code");
    });

    card.querySelector(".btn-edit-act")?.addEventListener("click", () => {
      openActivityModal(act);
    });

    card.querySelector(".btn-delete-act")?.addEventListener("click", () => {
      deleteActivity(act.id);
    });

    container.appendChild(card);
  });
}

// -----------------------------------------------------------------------------
// CATEGORY 5: RICH TEXT FIELD NOTES (TipTap WYSIWYG)
// -----------------------------------------------------------------------------
let tiptapEditor: Editor | null = null;
let saveNotesDebounceTimer: any = null;

function renderNotesSection(trip: Trip) {
  initTipTapEditor();
  if (tiptapEditor) {
    const currentHtml = tiptapEditor.getHTML();
    const targetHtml = trip.notes || "<p>Write custom itinerary notes, packing lists, restaurant ideas, or daily schedules here...</p>";
    if (currentHtml !== targetHtml) {
      tiptapEditor.commands.setContent(targetHtml);
    }
  }
}

function initTipTapEditor() {
  const container = document.getElementById("tiptap-editor-element");
  if (!container || tiptapEditor) return;

  tiptapEditor = new Editor({
    element: container,
    extensions: [
      StarterKit,
      Underline,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      CalloutBox,
    ],
    content: "<p></p>",
    onUpdate: () => {
      const statusEl = document.getElementById("notes-save-status");
      if (statusEl) statusEl.textContent = "✏️ Unsaved changes...";

      clearTimeout(saveNotesDebounceTimer);
      saveNotesDebounceTimer = setTimeout(() => {
        saveNotesContent(false);
      }, 2500);
    },
  });

  const toolbar = document.getElementById("tiptap-toolbar");
  if (toolbar) {
    toolbar.querySelectorAll(".tiptap-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (!tiptapEditor) return;

        const target = e.currentTarget as HTMLElement;
        const action = target.getAttribute("data-action");
        if (!action) return;

        switch (action) {
          case "bold":
            tiptapEditor.chain().focus().toggleBold().run();
            break;
          case "italic":
            tiptapEditor.chain().focus().toggleItalic().run();
            break;
          case "underline":
            tiptapEditor.chain().focus().toggleUnderline().run();
            break;
          case "strike":
            tiptapEditor.chain().focus().toggleStrike().run();
            break;
          case "highlight":
            tiptapEditor.chain().focus().toggleHighlight().run();
            break;
          case "heading-1":
            tiptapEditor.chain().focus().toggleHeading({ level: 1 }).run();
            break;
          case "heading-2":
            tiptapEditor.chain().focus().toggleHeading({ level: 2 }).run();
            break;
          case "heading-3":
            tiptapEditor.chain().focus().toggleHeading({ level: 3 }).run();
            break;
          case "paragraph":
            tiptapEditor.chain().focus().setParagraph().run();
            break;
          case "bullet-list":
            tiptapEditor.chain().focus().toggleBulletList().run();
            break;
          case "ordered-list":
            tiptapEditor.chain().focus().toggleOrderedList().run();
            break;
          case "blockquote":
            tiptapEditor.chain().focus().toggleBlockquote().run();
            break;
          case "hr":
            tiptapEditor.chain().focus().setHorizontalRule().run();
            break;
          case "insert-callout":
            tiptapEditor
              .chain()
              .focus()
              .insertContent('<div class="field-callout-box"><p>📌 <strong>Field Note:</strong> Write important travel details or reminders here...</p></div><p></p>')
              .run();
            break;
          case "clear-nodes":
            tiptapEditor.chain().focus().clearNodes().unsetAllMarks().run();
            break;
          case "undo":
            tiptapEditor.chain().focus().undo().run();
            break;
          case "redo":
            tiptapEditor.chain().focus().redo().run();
            break;
        }
      });
    });
  }

  document.getElementById("btn-save-notes")?.addEventListener("click", () => {
    saveNotesContent(true);
  });
}

async function saveNotesContent(showNotice: boolean = true) {
  if (!currentTrip || !tiptapEditor) return;
  const content = tiptapEditor.getHTML();
  currentTrip.notes = content;

  const statusEl = document.getElementById("notes-save-status");
  if (statusEl) statusEl.textContent = "⏳ Saving...";

  await saveTripToPB(currentTrip);
  if (statusEl) statusEl.textContent = "💾 All notes saved to cloud";
  if (showNotice) showToast("💾 Trip notes saved successfully!");
}

// -----------------------------------------------------------------------------
// CRUD & MODALS: FLIGHTS
// -----------------------------------------------------------------------------
const flightModal = document.getElementById("flight-modal");
const flightForm = document.getElementById("flight-form") as HTMLFormElement | null;
const flightEditIdInput = document.getElementById("flight-edit-id") as HTMLInputElement | null;
const flightAirlineInput = document.getElementById("flight-airline-input") as HTMLInputElement | null;
const flightNumberInput = document.getElementById("flight-number-input") as HTMLInputElement | null;
const flightDepartureAirportInput = document.getElementById("flight-departure-airport-input") as HTMLInputElement | null;
const flightArrivalAirportInput = document.getElementById("flight-arrival-airport-input") as HTMLInputElement | null;
const flightDepartureTimeInput = document.getElementById("flight-departure-time-input") as HTMLInputElement | null;
const flightArrivalTimeInput = document.getElementById("flight-arrival-time-input") as HTMLInputElement | null;
const flightConfirmationInput = document.getElementById("flight-confirmation-input") as HTMLInputElement | null;
const flightCostInput = document.getElementById("flight-cost-input") as HTMLInputElement | null;
const flightSeatsInput = document.getElementById("flight-seats-input") as HTMLInputElement | null;
const flightTerminalInput = document.getElementById("flight-terminal-input") as HTMLInputElement | null;
const flightNotesInput = document.getElementById("flight-notes-input") as HTMLTextAreaElement | null;
const btnDeleteFlightModal = document.getElementById("btn-delete-flight-modal") as HTMLButtonElement | null;

function openFlightModal(flight?: FlightBooking) {
  if (!flightModal || !flightForm) return;
  flightForm.reset();

  const titleEl = document.getElementById("flight-modal-title");
  if (flight) {
    if (titleEl) titleEl.textContent = "✏️ Edit Flight";
    if (flightEditIdInput) flightEditIdInput.value = flight.id;
    if (flightAirlineInput) flightAirlineInput.value = flight.airline;
    if (flightNumberInput) flightNumberInput.value = flight.flightNumber;
    if (flightDepartureAirportInput) flightDepartureAirportInput.value = flight.departureAirport;
    if (flightArrivalAirportInput) flightArrivalAirportInput.value = flight.arrivalAirport;
    if (flightDepartureTimeInput) flightDepartureTimeInput.value = flight.departureDateTime || "";
    if (flightArrivalTimeInput) flightArrivalTimeInput.value = flight.arrivalDateTime || "";
    if (flightConfirmationInput) flightConfirmationInput.value = flight.confirmationCode || "";
    if (flightCostInput) flightCostInput.value = flight.cost ? String(flight.cost) : "";
    if (flightSeatsInput) flightSeatsInput.value = flight.seats || "";
    if (flightTerminalInput) flightTerminalInput.value = flight.terminalGate || "";
    if (flightNotesInput) flightNotesInput.value = flight.notes || "";
    if (btnDeleteFlightModal) btnDeleteFlightModal.style.display = "inline-block";
  } else {
    if (titleEl) titleEl.textContent = "✈️ Add Flight";
    if (flightEditIdInput) flightEditIdInput.value = "";
    if (btnDeleteFlightModal) btnDeleteFlightModal.style.display = "none";
  }

  flightModal.style.display = "flex";
}

function closeFlightModal() {
  if (flightModal) flightModal.style.display = "none";
}

async function deleteFlight(id: string) {
  if (!currentTrip || !currentTrip.bookings?.flights) return;
  currentTrip.bookings.flights = currentTrip.bookings.flights.filter((f) => f.id !== id);
  await saveTripToPB(currentTrip);
  renderTripDossier(currentTrip);
  showToast("🗑️ Flight deleted.");
}

// -----------------------------------------------------------------------------
// CRUD & MODALS: HOTELS
// -----------------------------------------------------------------------------
const hotelModal = document.getElementById("hotel-modal");
const hotelForm = document.getElementById("hotel-form") as HTMLFormElement | null;
const hotelEditIdInput = document.getElementById("hotel-edit-id") as HTMLInputElement | null;
const hotelNameInput = document.getElementById("hotel-name-input") as HTMLInputElement | null;
const hotelAddressInput = document.getElementById("hotel-address-input") as HTMLInputElement | null;
const hotelCheckinDateInput = document.getElementById("hotel-checkin-date-input") as HTMLInputElement | null;
const hotelCheckoutDateInput = document.getElementById("hotel-checkout-date-input") as HTMLInputElement | null;
const hotelConfirmationInput = document.getElementById("hotel-confirmation-input") as HTMLInputElement | null;
const hotelCostInput = document.getElementById("hotel-cost-input") as HTMLInputElement | null;
const hotelRoomTypeInput = document.getElementById("hotel-room-type-input") as HTMLInputElement | null;
const hotelNotesInput = document.getElementById("hotel-notes-input") as HTMLTextAreaElement | null;
const btnDeleteHotelModal = document.getElementById("btn-delete-hotel-modal") as HTMLButtonElement | null;

function openHotelModal(hotel?: HotelBooking) {
  if (!hotelModal || !hotelForm) return;
  hotelForm.reset();

  const titleEl = document.getElementById("hotel-modal-title");
  if (hotel) {
    if (titleEl) titleEl.textContent = "✏️ Edit Hotel & Lodging";
    if (hotelEditIdInput) hotelEditIdInput.value = hotel.id;
    if (hotelNameInput) hotelNameInput.value = hotel.name;
    if (hotelAddressInput) hotelAddressInput.value = hotel.address || "";
    if (hotelCheckinDateInput) hotelCheckinDateInput.value = hotel.checkInDate || "";
    if (hotelCheckoutDateInput) hotelCheckoutDateInput.value = hotel.checkOutDate || "";
    if (hotelConfirmationInput) hotelConfirmationInput.value = hotel.confirmationCode || "";
    if (hotelCostInput) hotelCostInput.value = hotel.cost ? String(hotel.cost) : "";
    if (hotelRoomTypeInput) hotelRoomTypeInput.value = hotel.roomType || "";
    if (hotelNotesInput) hotelNotesInput.value = hotel.notes || "";
    if (btnDeleteHotelModal) btnDeleteHotelModal.style.display = "inline-block";
  } else {
    if (titleEl) titleEl.textContent = "🏨 Add Hotel & Lodging";
    if (hotelEditIdInput) hotelEditIdInput.value = "";
    if (btnDeleteHotelModal) btnDeleteHotelModal.style.display = "none";
  }

  hotelModal.style.display = "flex";
}

function closeHotelModal() {
  if (hotelModal) hotelModal.style.display = "none";
}

async function deleteHotel(id: string) {
  if (!currentTrip || !currentTrip.bookings?.hotels) return;
  currentTrip.bookings.hotels = currentTrip.bookings.hotels.filter((h) => h.id !== id);
  await saveTripToPB(currentTrip);
  renderTripDossier(currentTrip);
  showToast("🗑️ Hotel deleted.");
}

// -----------------------------------------------------------------------------
// CRUD & MODALS: RENTAL CARS
// -----------------------------------------------------------------------------
const carModal = document.getElementById("car-modal");
const carForm = document.getElementById("car-form") as HTMLFormElement | null;
const carEditIdInput = document.getElementById("car-edit-id") as HTMLInputElement | null;
const carProviderInput = document.getElementById("car-provider-input") as HTMLInputElement | null;
const carVehicleTypeInput = document.getElementById("car-vehicle-type-input") as HTMLInputElement | null;
const carPickupLocationInput = document.getElementById("car-pickup-location-input") as HTMLInputElement | null;
const carPickupTimeInput = document.getElementById("car-pickup-time-input") as HTMLInputElement | null;
const carDropoffLocationInput = document.getElementById("car-dropoff-location-input") as HTMLInputElement | null;
const carDropoffTimeInput = document.getElementById("car-dropoff-time-input") as HTMLInputElement | null;
const carConfirmationInput = document.getElementById("car-confirmation-input") as HTMLInputElement | null;
const carCostInput = document.getElementById("car-cost-input") as HTMLInputElement | null;
const carNotesInput = document.getElementById("car-notes-input") as HTMLTextAreaElement | null;
const btnDeleteCarModal = document.getElementById("btn-delete-car-modal") as HTMLButtonElement | null;

function openCarModal(car?: RentalCarBooking) {
  if (!carModal || !carForm) return;
  carForm.reset();

  const titleEl = document.getElementById("car-modal-title");
  if (car) {
    if (titleEl) titleEl.textContent = "✏️ Edit Rental Car";
    if (carEditIdInput) carEditIdInput.value = car.id;
    if (carProviderInput) carProviderInput.value = car.provider;
    if (carVehicleTypeInput) carVehicleTypeInput.value = car.vehicleType || "";
    if (carPickupLocationInput) carPickupLocationInput.value = car.pickupLocation || "";
    if (carPickupTimeInput) carPickupTimeInput.value = car.pickupDateTime || "";
    if (carDropoffLocationInput) carDropoffLocationInput.value = car.dropoffLocation || "";
    if (carDropoffTimeInput) carDropoffTimeInput.value = car.dropoffDateTime || "";
    if (carConfirmationInput) carConfirmationInput.value = car.confirmationCode || "";
    if (carCostInput) carCostInput.value = car.cost ? String(car.cost) : "";
    if (carNotesInput) carNotesInput.value = car.notes || "";
    if (btnDeleteCarModal) btnDeleteCarModal.style.display = "inline-block";
  } else {
    if (titleEl) titleEl.textContent = "🚗 Add Rental Car";
    if (carEditIdInput) carEditIdInput.value = "";
    if (btnDeleteCarModal) btnDeleteCarModal.style.display = "none";
  }

  carModal.style.display = "flex";
}

function closeCarModal() {
  if (carModal) carModal.style.display = "none";
}

async function deleteCar(id: string) {
  if (!currentTrip || !currentTrip.bookings?.rentalCars) return;
  currentTrip.bookings.rentalCars = currentTrip.bookings.rentalCars.filter((c) => c.id !== id);
  await saveTripToPB(currentTrip);
  renderTripDossier(currentTrip);
  showToast("🗑️ Rental car deleted.");
}

// -----------------------------------------------------------------------------
// CRUD & MODALS: ACTIVITIES
// -----------------------------------------------------------------------------
const activityModal = document.getElementById("activity-modal");
const activityForm = document.getElementById("activity-form") as HTMLFormElement | null;
const activityEditIdInput = document.getElementById("activity-edit-id") as HTMLInputElement | null;
const activityTitleInput = document.getElementById("activity-title-input") as HTMLInputElement | null;
const activityLocationInput = document.getElementById("activity-location-input") as HTMLInputElement | null;
const activityTimeInput = document.getElementById("activity-time-input") as HTMLInputElement | null;
const activityConfirmationInput = document.getElementById("activity-confirmation-input") as HTMLInputElement | null;
const activityCostInput = document.getElementById("activity-cost-input") as HTMLInputElement | null;
const activityNotesInput = document.getElementById("activity-notes-input") as HTMLTextAreaElement | null;
const btnDeleteActivityModal = document.getElementById("btn-delete-activity-modal") as HTMLButtonElement | null;

function openActivityModal(act?: ActivityBooking) {
  if (!activityModal || !activityForm) return;
  activityForm.reset();

  const titleEl = document.getElementById("activity-modal-title");
  if (act) {
    if (titleEl) titleEl.textContent = "✏️ Edit Activity or Pass";
    if (activityEditIdInput) activityEditIdInput.value = act.id;
    if (activityTitleInput) activityTitleInput.value = act.title;
    if (activityLocationInput) activityLocationInput.value = act.location || "";
    if (activityTimeInput) activityTimeInput.value = act.dateTime || "";
    if (activityConfirmationInput) activityConfirmationInput.value = act.confirmationCode || "";
    if (activityCostInput) activityCostInput.value = act.cost ? String(act.cost) : "";
    if (activityNotesInput) activityNotesInput.value = act.notes || "";
    if (btnDeleteActivityModal) btnDeleteActivityModal.style.display = "inline-block";
  } else {
    if (titleEl) titleEl.textContent = "🎟️ Add Activity or Pass";
    if (activityEditIdInput) activityEditIdInput.value = "";
    if (btnDeleteActivityModal) btnDeleteActivityModal.style.display = "none";
  }

  activityModal.style.display = "flex";
}

function closeActivityModal() {
  if (activityModal) activityModal.style.display = "none";
}

async function deleteActivity(id: string) {
  if (!currentTrip || !currentTrip.bookings?.activities) return;
  currentTrip.bookings.activities = currentTrip.bookings.activities.filter((a) => a.id !== id);
  await saveTripToPB(currentTrip);
  renderTripDossier(currentTrip);
  showToast("🗑️ Activity deleted.");
}

// -----------------------------------------------------------------------------
// TRIP HEADER EDIT MODAL
// -----------------------------------------------------------------------------
const tripHeaderModal = document.getElementById("trip-header-modal");
const tripHeaderForm = document.getElementById("trip-header-form") as HTMLFormElement | null;
const editTripTitleInput = document.getElementById("edit-trip-title-input") as HTMLInputElement | null;
const editTripSubtitleInput = document.getElementById("edit-trip-subtitle-input") as HTMLInputElement | null;
const editTripDatesInput = document.getElementById("edit-trip-dates-input") as HTMLInputElement | null;
const editTripSummaryInput = document.getElementById("edit-trip-summary-input") as HTMLTextAreaElement | null;

function openTripHeaderModal() {
  if (!tripHeaderModal || !currentTrip) return;
  if (editTripTitleInput) editTripTitleInput.value = currentTrip.title;
  if (editTripSubtitleInput) editTripSubtitleInput.value = currentTrip.subtitle || currentTrip.destination;
  if (editTripDatesInput) editTripDatesInput.value = currentTrip.dates;
  if (editTripSummaryInput) editTripSummaryInput.value = currentTrip.summary || "";
  tripHeaderModal.style.display = "flex";
}

function closeTripHeaderModal() {
  if (tripHeaderModal) tripHeaderModal.style.display = "none";
}

// -----------------------------------------------------------------------------
// EVENT LISTENERS INITIALIZATION
// -----------------------------------------------------------------------------
function setupEventListeners() {
  // Navigation
  btnBackToDashboard?.addEventListener("click", () => router.navigateToDashboard());
  headerBrandLink?.addEventListener("click", () => router.navigateToDashboard());
  document.getElementById("btn-open-edit-header-modal")?.addEventListener("click", () => openTripHeaderModal());

  // Filter Buttons
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      filterBtns.forEach((b) => b.classList.remove("active"));
      const target = e.currentTarget as HTMLElement;
      target.classList.add("active");
      activeStatusFilter = target.getAttribute("data-status") || "all";
      renderDashboardGrid();
    });
  });

  // Search Input
  tripSearchInput?.addEventListener("input", (e) => {
    searchQuery = (e.target as HTMLInputElement).value;
    renderDashboardGrid();
  });

  // Modal triggers
  document.getElementById("btn-add-flight")?.addEventListener("click", () => openFlightModal());
  document.getElementById("btn-add-hotel")?.addEventListener("click", () => openHotelModal());
  document.getElementById("btn-add-car")?.addEventListener("click", () => openCarModal());
  document.getElementById("btn-add-activity")?.addEventListener("click", () => openActivityModal());

  // Modal Close buttons
  document.getElementById("flight-modal-close")?.addEventListener("click", closeFlightModal);
  document.getElementById("flight-modal-cancel")?.addEventListener("click", closeFlightModal);

  document.getElementById("hotel-modal-close")?.addEventListener("click", closeHotelModal);
  document.getElementById("hotel-modal-cancel")?.addEventListener("click", closeHotelModal);

  document.getElementById("car-modal-close")?.addEventListener("click", closeCarModal);
  document.getElementById("car-modal-cancel")?.addEventListener("click", closeCarModal);

  document.getElementById("activity-modal-close")?.addEventListener("click", closeActivityModal);
  document.getElementById("activity-modal-cancel")?.addEventListener("click", closeActivityModal);

  document.getElementById("trip-header-modal-close")?.addEventListener("click", closeTripHeaderModal);
  document.getElementById("trip-header-modal-cancel")?.addEventListener("click", closeTripHeaderModal);

  // Form Submissions: Flight
  flightForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentTrip) return;

    if (!currentTrip.bookings) {
      currentTrip.bookings = { flights: [], hotels: [], rentalCars: [], activities: [] };
    }
    if (!Array.isArray(currentTrip.bookings.flights)) {
      currentTrip.bookings.flights = [];
    }

    const editId = flightEditIdInput?.value;
    const flightData: FlightBooking = {
      id: editId || "flight-" + Date.now(),
      airline: flightAirlineInput?.value.trim() || "",
      flightNumber: flightNumberInput?.value.trim() || "",
      departureAirport: flightDepartureAirportInput?.value.trim() || "",
      arrivalAirport: flightArrivalAirportInput?.value.trim() || "",
      departureDateTime: flightDepartureTimeInput?.value.trim() || "",
      arrivalDateTime: flightArrivalTimeInput?.value.trim() || "",
      confirmationCode: flightConfirmationInput?.value.trim() || "",
      cost: flightCostInput?.value ? parseFloat(flightCostInput.value) : undefined,
      seats: flightSeatsInput?.value.trim() || "",
      terminalGate: flightTerminalInput?.value.trim() || "",
      notes: flightNotesInput?.value.trim() || ""
    };

    if (editId) {
      const idx = currentTrip.bookings.flights.findIndex((f) => f.id === editId);
      if (idx !== -1) currentTrip.bookings.flights[idx] = flightData;
      else currentTrip.bookings.flights.push(flightData);
    } else {
      currentTrip.bookings.flights.push(flightData);
    }

    closeFlightModal();
    renderTripDossier(currentTrip);
    showToast(`💾 Saved Flight ${flightData.airline} ${flightData.flightNumber}`);
    await saveTripToPB(currentTrip);
  });

  btnDeleteFlightModal?.addEventListener("click", () => {
    const editId = flightEditIdInput?.value;
    if (editId) {
      deleteFlight(editId);
      closeFlightModal();
    }
  });

  // Form Submissions: Hotel
  hotelForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentTrip) return;

    if (!currentTrip.bookings) {
      currentTrip.bookings = { flights: [], hotels: [], rentalCars: [], activities: [] };
    }
    if (!Array.isArray(currentTrip.bookings.hotels)) {
      currentTrip.bookings.hotels = [];
    }

    const editId = hotelEditIdInput?.value;
    const hotelData: HotelBooking = {
      id: editId || "hotel-" + Date.now(),
      name: hotelNameInput?.value.trim() || "",
      address: hotelAddressInput?.value.trim() || "",
      checkInDate: hotelCheckinDateInput?.value.trim() || "",
      checkOutDate: hotelCheckoutDateInput?.value.trim() || "",
      confirmationCode: hotelConfirmationInput?.value.trim() || "",
      cost: hotelCostInput?.value ? parseFloat(hotelCostInput.value) : undefined,
      roomType: hotelRoomTypeInput?.value.trim() || "",
      notes: hotelNotesInput?.value.trim() || ""
    };

    if (editId) {
      const idx = currentTrip.bookings.hotels.findIndex((h) => h.id === editId);
      if (idx !== -1) currentTrip.bookings.hotels[idx] = hotelData;
      else currentTrip.bookings.hotels.push(hotelData);
    } else {
      currentTrip.bookings.hotels.push(hotelData);
    }

    closeHotelModal();
    renderTripDossier(currentTrip);
    showToast(`💾 Saved Hotel "${hotelData.name}"`);
    await saveTripToPB(currentTrip);
  });

  btnDeleteHotelModal?.addEventListener("click", () => {
    const editId = hotelEditIdInput?.value;
    if (editId) {
      deleteHotel(editId);
      closeHotelModal();
    }
  });

  // Form Submissions: Rental Car
  carForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentTrip) return;

    if (!currentTrip.bookings) {
      currentTrip.bookings = { flights: [], hotels: [], rentalCars: [], activities: [] };
    }
    if (!Array.isArray(currentTrip.bookings.rentalCars)) {
      currentTrip.bookings.rentalCars = [];
    }

    const editId = carEditIdInput?.value;
    const carData: RentalCarBooking = {
      id: editId || "car-" + Date.now(),
      provider: carProviderInput?.value.trim() || "",
      vehicleType: carVehicleTypeInput?.value.trim() || "",
      pickupLocation: carPickupLocationInput?.value.trim() || "",
      pickupDateTime: carPickupTimeInput?.value.trim() || "",
      dropoffLocation: carDropoffLocationInput?.value.trim() || "",
      dropoffDateTime: carDropoffTimeInput?.value.trim() || "",
      confirmationCode: carConfirmationInput?.value.trim() || "",
      cost: carCostInput?.value ? parseFloat(carCostInput.value) : undefined,
      notes: carNotesInput?.value.trim() || ""
    };

    if (editId) {
      const idx = currentTrip.bookings.rentalCars.findIndex((c) => c.id === editId);
      if (idx !== -1) currentTrip.bookings.rentalCars[idx] = carData;
      else currentTrip.bookings.rentalCars.push(carData);
    } else {
      currentTrip.bookings.rentalCars.push(carData);
    }

    closeCarModal();
    renderTripDossier(currentTrip);
    showToast(`💾 Saved Rental Car "${carData.provider}"`);
    await saveTripToPB(currentTrip);
  });

  btnDeleteCarModal?.addEventListener("click", () => {
    const editId = carEditIdInput?.value;
    if (editId) {
      deleteCar(editId);
      closeCarModal();
    }
  });

  // Form Submissions: Activity
  activityForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentTrip) return;

    if (!currentTrip.bookings) {
      currentTrip.bookings = { flights: [], hotels: [], rentalCars: [], activities: [] };
    }
    if (!Array.isArray(currentTrip.bookings.activities)) {
      currentTrip.bookings.activities = [];
    }

    const editId = activityEditIdInput?.value;
    const actData: ActivityBooking = {
      id: editId || "act-" + Date.now(),
      title: activityTitleInput?.value.trim() || "",
      location: activityLocationInput?.value.trim() || "",
      dateTime: activityTimeInput?.value.trim() || "",
      confirmationCode: activityConfirmationInput?.value.trim() || "",
      cost: activityCostInput?.value ? parseFloat(activityCostInput.value) : undefined,
      notes: activityNotesInput?.value.trim() || ""
    };

    if (editId) {
      const idx = currentTrip.bookings.activities.findIndex((a) => a.id === editId);
      if (idx !== -1) currentTrip.bookings.activities[idx] = actData;
      else currentTrip.bookings.activities.push(actData);
    } else {
      currentTrip.bookings.activities.push(actData);
    }

    closeActivityModal();
    renderTripDossier(currentTrip);
    showToast(`💾 Saved Activity "${actData.title}"`);
    await saveTripToPB(currentTrip);
  });

  btnDeleteActivityModal?.addEventListener("click", () => {
    const editId = activityEditIdInput?.value;
    if (editId) {
      deleteActivity(editId);
      closeActivityModal();
    }
  });

  // Form Submissions: Trip Header
  tripHeaderForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentTrip) return;

    currentTrip.title = editTripTitleInput?.value.trim() || currentTrip.title;
    currentTrip.subtitle = editTripSubtitleInput?.value.trim() || "";
    currentTrip.destination = editTripSubtitleInput?.value.trim() || currentTrip.destination;
    currentTrip.dates = editTripDatesInput?.value.trim() || currentTrip.dates;
    currentTrip.summary = editTripSummaryInput?.value.trim() || "";

    closeTripHeaderModal();
    renderTripDossier(currentTrip);
    showToast(`💾 Saved trip header "${currentTrip.title}"`);
    await saveTripToPB(currentTrip);
  });
}

// Initial Sync & Boot
async function init() {
  setupEventListeners();

  try {
    const res = await fetchTripsFromPB();
    if (res.trips && res.trips.length > 0) {
      trips = res.trips;
    }
  } catch (err) {
    console.warn("Initial sync error:", err);
  }

  // Trigger initial route
  router.handleHashChange();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
