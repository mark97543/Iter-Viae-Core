import "./styles.css";
import { pb, loginTravelUser, logoutTravelUser, isUserAuthenticated, getCurrentUser } from "./pocketbase";
import { allItineraryPages, getItineraryBySlug, ItineraryPage } from "./data/pages";

console.log("WADE FAMILY TRAVEL BOOK — travel.wade-usa.com initialized.");

// State Variables
let currentSlug: string | null = null;
let searchQuery: string = "";

// DOM Element References
const travelAuthModal = document.getElementById("travel-auth-modal");
const travelLoginForm = document.getElementById("travel-login-form") as HTMLFormElement | null;
const travelAuthEmail = document.getElementById("travel-auth-email") as HTMLInputElement | null;
const travelAuthPassword = document.getElementById("travel-auth-password") as HTMLInputElement | null;
const authErrorMsg = document.getElementById("auth-error-msg");

const libraryView = document.getElementById("library-view");
const slugDetailView = document.getElementById("slug-detail-view");

const slugCardsGrid = document.getElementById("slug-cards-grid");
const slugSearchInput = document.getElementById("slug-search-input") as HTMLInputElement | null;
const tripCountBadge = document.getElementById("trip-count-badge");

const slugHeaderContainer = document.getElementById("slug-header-container");
const detailSlugTag = document.getElementById("detail-slug-tag");
const scheduleContainer = document.getElementById("schedule-container");
const reservationsContainer = document.getElementById("reservations-container");
const packingContainer = document.getElementById("packing-container");
const notesContainer = document.getElementById("notes-container");

const addPageModal = document.getElementById("add-page-modal");
const travelMenuModal = document.getElementById("travel-menu-modal");

// Toast Notifications Helper
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

// Update Auth UI Gate State
function updateAuthUI() {
  const authenticated = isUserAuthenticated();
  if (travelAuthModal) {
    travelAuthModal.style.display = authenticated ? "none" : "flex";
  }

  if (authenticated) {
    const user = getCurrentUser();
    const menuUserEmail = document.getElementById("menu-user-email");
    if (menuUserEmail) {
      menuUserEmail.textContent = user?.email || user?.username || "Authenticated Family Member";
    }
    handleRoute();
  }
}

// Password Login Form Submission
if (travelLoginForm) {
  travelLoginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!travelAuthEmail || !travelAuthPassword) return;

    if (authErrorMsg) authErrorMsg.style.display = "none";
    const emailVal = travelAuthEmail.value.trim();
    const passVal = travelAuthPassword.value;

    try {
      await loginTravelUser(emailVal, passVal);
      showToast("🔓 Welcome to Wade Family Travel Book!");
      updateAuthUI();
    } catch (err: any) {
      console.error("Travel auth failed:", err);
      if (authErrorMsg) {
        authErrorMsg.textContent = err.message || "Invalid account email or password.";
        authErrorMsg.style.display = "block";
      }
    }
  });
}

// Client-Side Routing Engine based on URL Hash (#/<slug>)
function handleRoute() {
  if (!isUserAuthenticated()) return;

  const hash = window.location.hash.replace(/^#\/?/, "");
  if (!hash || hash === "") {
    // Show Library Grid
    currentSlug = null;
    if (libraryView) libraryView.style.display = "block";
    if (slugDetailView) slugDetailView.style.display = "none";
    renderLibraryGrid();
  } else {
    // Show Slug Page Detail View
    const page = getItineraryBySlug(hash);
    if (page) {
      currentSlug = page.slug;
      if (libraryView) libraryView.style.display = "none";
      if (slugDetailView) slugDetailView.style.display = "block";
      renderSlugDetail(page);
    } else {
      // Slug not found -> redirect to library grid
      showToast(`⚠️ Itinerary slug "${hash}" not found. Returning to library.`);
      window.location.hash = "#/";
    }
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Listen to Hash Changes
window.addEventListener("hashchange", handleRoute);

// Render Post-Login Slug Cards Grid
function renderLibraryGrid() {
  if (!slugCardsGrid) return;
  slugCardsGrid.innerHTML = "";

  const query = searchQuery.toLowerCase().trim();
  const filteredPages = allItineraryPages.filter((p) => {
    if (!query) return true;
    return (
      p.title.toLowerCase().includes(query) ||
      p.slug.toLowerCase().includes(query) ||
      (p.destination && p.destination.toLowerCase().includes(query)) ||
      (p.dates && p.dates.toLowerCase().includes(query))
    );
  });

  if (tripCountBadge) {
    tripCountBadge.textContent = `${filteredPages.length} Travel ${filteredPages.length === 1 ? "Slug" : "Slugs"} Loaded`;
  }

  filteredPages.forEach((page) => {
    const card = document.createElement("div");
    card.className = "slug-card";
    card.addEventListener("click", () => {
      window.location.hash = `#/${page.slug}`;
    });

    const coverGradient = page.coverGradient || "linear-gradient(135deg, #8b5cf6, #ec4899)";
    const coverEmoji = page.coverEmoji || "✈️";

    card.innerHTML = `
      <div class="slug-card-cover" style="background: ${coverGradient}">
        <div class="cover-badge-row">
          <span class="cover-emoji">${coverEmoji}</span>
          <span class="slug-pill-badge">#${page.slug}</span>
        </div>
        <div class="slug-card-dates">${page.dates || "Dates TBD"}</div>
      </div>
      <div class="slug-card-body">
        <div>
          <h3 class="slug-card-title">${page.title}</h3>
          <p class="slug-card-subtitle">${page.subtitle || page.destination || ""}</p>
          <p class="slug-card-summary">${page.summary || "View full itinerary, daily schedules, and hotel reservations."}</p>
        </div>
        <div>
          <div class="slug-card-stats">
            ${page.stats?.days ? `<span class="stat-chip">📅 ${page.stats.days} Days</span>` : ""}
            ${page.stats?.travelers ? `<span class="stat-chip">👥 ${page.stats.travelers} Travelers</span>` : ""}
            ${page.stats?.budget ? `<span class="stat-chip">💵 ${page.stats.budget}</span>` : ""}
          </div>
          <button class="slug-card-btn">
            Open Itinerary &rarr;
          </button>
        </div>
      </div>
    `;

    slugCardsGrid.appendChild(card);
  });

  // Append Special "Add New Page (Copy-Paste Guide)" Prompt Card
  const addCard = document.createElement("div");
  addCard.className = "add-page-card";
  addCard.addEventListener("click", () => {
    if (addPageModal) addPageModal.style.display = "flex";
  });
  addCard.innerHTML = `
    <div class="add-page-icon">➕</div>
    <h3 class="add-page-title">Add New Itinerary Page</h3>
    <p class="add-page-sub">Learn how to easily copy & paste the template file to manually add a new trip slug.</p>
    <button class="btn btn-secondary">⚡ View Copy-Paste Instructions</button>
  `;
  slugCardsGrid.appendChild(addCard);
}

// Search Input Listener
if (slugSearchInput) {
  slugSearchInput.addEventListener("input", (e) => {
    searchQuery = (e.target as HTMLInputElement).value;
    renderLibraryGrid();
  });
}

// Render Individual Slug Detail View
function renderSlugDetail(page: ItineraryPage) {
  if (detailSlugTag) detailSlugTag.textContent = `#${page.slug}`;

  // Render Header Banner
  if (slugHeaderContainer) {
    const coverGradient = page.coverGradient || "linear-gradient(135deg, #3b82f6, #8b5cf6)";
    slugHeaderContainer.innerHTML = `
      <div class="slug-header-card" style="background: ${coverGradient}">
        <div class="slug-header-top">
          <span class="slug-header-emoji">${page.coverEmoji || "✈️"}</span>
          <span class="slug-header-dates">${page.dates || "Dates TBD"}</span>
        </div>
        <h1 class="slug-header-title">${page.title}</h1>
        <p class="slug-header-sub">${page.subtitle || page.destination || ""}</p>
        <div class="slug-header-stats-row">
          ${page.destination ? `<span class="header-stat-badge">📍 ${page.destination}</span>` : ""}
          ${page.stats?.days ? `<span class="header-stat-badge">📅 ${page.stats.days} Days</span>` : ""}
          ${page.stats?.travelers ? `<span class="header-stat-badge">👥 ${page.stats.travelers} Travelers</span>` : ""}
          ${page.stats?.budget ? `<span class="header-stat-badge">💵 ${page.stats.budget}</span>` : ""}
          ${page.stats?.season ? `<span class="header-stat-badge">🌤️ ${page.stats.season}</span>` : ""}
        </div>
      </div>
    `;
  }

  // Render Day-by-Day Schedule
  if (scheduleContainer) {
    scheduleContainer.innerHTML = "";
    if (page.schedule && page.schedule.length > 0) {
      page.schedule.forEach((day) => {
        const dayCard = document.createElement("div");
        dayCard.className = "schedule-day-card";

        const activitiesHtml = day.activities.map((act) => `
          <div class="activity-item">
            <div class="activity-time-col">${act.time || "--:--"}</div>
            <div class="activity-main-col">
              <div class="activity-header-row">
                <h4 class="activity-title">${act.title}</h4>
                ${act.cost ? `<span class="activity-cost">${act.cost}</span>` : ""}
              </div>
              ${act.location ? `<div class="activity-location">📍 ${act.location}</div>` : ""}
              ${act.description ? `<p class="activity-desc">${act.description}</p>` : ""}
              ${act.confirmationCode ? `<div class="res-conf-code" style="display: inline-block; margin-bottom: 0.5rem;">CONF: ${act.confirmationCode}</div>` : ""}
              ${act.tags && act.tags.length > 0 ? `
                <div class="activity-tags-row">
                  ${act.tags.map(t => `<span class="activity-tag">#${t}</span>`).join("")}
                </div>
              ` : ""}
            </div>
          </div>
        `).join("");

        dayCard.innerHTML = `
          <div class="day-card-header">
            <div class="day-header-title-group">
              <span class="day-badge">DAY ${day.dayNumber}</span>
              <div>
                <h3 class="day-title">${day.title}</h3>
                ${day.subtitle ? `<div class="day-subtitle">${day.subtitle}</div>` : ""}
              </div>
            </div>
            ${day.date ? `<div class="day-date">${day.date}</div>` : ""}
          </div>
          <div class="activities-list">
            ${activitiesHtml}
          </div>
          ${day.notes ? `<div class="day-notes-box">💡 <strong>Daily Note:</strong> ${day.notes}</div>` : ""}
        `;
        scheduleContainer.appendChild(dayCard);
      });
    } else {
      scheduleContainer.innerHTML = `<p style="color: var(--text-dim); text-align: center; padding: 2rem;">No schedule items added yet.</p>`;
    }
  }

  // Render Reservations
  if (reservationsContainer) {
    reservationsContainer.innerHTML = "";
    if (page.reservations && page.reservations.length > 0) {
      page.reservations.forEach((res) => {
        const resCard = document.createElement("div");
        resCard.className = "res-card";

        const typeClass = `res-type-${res.type || "other"}`;

        resCard.innerHTML = `
          <div>
            <div class="res-header">
              <span class="res-type-badge ${typeClass}">${res.type}</span>
              ${res.confirmationCode ? `<span class="res-conf-code">#${res.confirmationCode}</span>` : ""}
            </div>
            <h3 class="res-title">${res.title}</h3>
            ${res.provider ? `<div class="res-provider">${res.provider}</div>` : ""}
            <div class="res-details-box">
              ${res.dates ? `<div class="res-detail-row"><strong>Dates/Time:</strong> ${res.dates}</div>` : ""}
              ${res.addressOrDetails ? `<div class="res-detail-row"><strong>Location:</strong> ${res.addressOrDetails}</div>` : ""}
            </div>
          </div>
          ${res.notes ? `<div class="res-notes">📝 ${res.notes}</div>` : ""}
        `;
        reservationsContainer.appendChild(resCard);
      });
    } else {
      reservationsContainer.innerHTML = `<p style="color: var(--text-dim); text-align: center; padding: 2rem; grid-column: 1 / -1;">No flight or hotel reservations recorded.</p>`;
    }
  }

  // Render Packing List
  if (packingContainer) {
    packingContainer.innerHTML = "";
    if (page.packingList && page.packingList.length > 0) {
      page.packingList.forEach((cat, catIdx) => {
        const catCard = document.createElement("div");
        catCard.className = "packing-category-card";

        const itemsHtml = cat.items.map((item, itemIdx) => {
          const storageKey = `packing_${page.slug}_${catIdx}_${itemIdx}`;
          const isChecked = localStorage.getItem(storageKey) === "true";

          return `
            <label class="packing-item-label ${isChecked ? 'checked' : ''}" data-key="${storageKey}">
              <input type="checkbox" class="packing-checkbox" ${isChecked ? 'checked' : ''} />
              <span>${item}</span>
            </label>
          `;
        }).join("");

        catCard.innerHTML = `
          <h3 class="packing-category-title">${cat.category}</h3>
          <div class="packing-items-list">
            ${itemsHtml}
          </div>
        `;
        packingContainer.appendChild(catCard);
      });

      // Add Checkbox listeners
      packingContainer.querySelectorAll(".packing-checkbox").forEach((cb) => {
        cb.addEventListener("change", (e) => {
          const input = e.target as HTMLInputElement;
          const label = input.closest(".packing-item-label");
          const key = label?.getAttribute("data-key");
          if (key) {
            localStorage.setItem(key, input.checked ? "true" : "false");
            if (input.checked) {
              label?.classList.add("checked");
            } else {
              label?.classList.remove("checked");
            }
          }
        });
      });
    } else {
      packingContainer.innerHTML = `<p style="color: var(--text-dim); text-align: center; padding: 2rem; grid-column: 1 / -1;">No packing checklist defined.</p>`;
    }
  }

  // Render Notes
  if (notesContainer) {
    notesContainer.innerHTML = "";
    const notesList = page.notes || [];

    const notesHtml = notesList.map((n) => `
      <div class="note-item-card">
        ${n}
      </div>
    `).join("");

    notesContainer.innerHTML = `
      <div class="notes-header-row">
        <span style="font-size: 1.5rem;">📝</span>
        <h3 class="notes-header-title">Travel Briefing & Emergency Notes</h3>
      </div>
      <div class="notes-list">
        ${notesHtml || "<p style='color: var(--text-dim);'>No briefing notes recorded for this travel slug.</p>"}
      </div>
    `;
  }
}

// Tab Switching Listener
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;
    const tabName = target.getAttribute("data-tab");

    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => ((p as HTMLElement).style.display = "none"));

    target.classList.add("active");
    const activePanel = document.getElementById(`panel-${tabName}`);
    if (activePanel) activePanel.style.display = "block";
  });
});

// Navigation Buttons
const btnNavLibrary = document.getElementById("btn-nav-library");
const btnBackToLibrary = document.getElementById("btn-back-to-library");
const headerBrandLink = document.getElementById("header-brand-link");

if (btnNavLibrary) btnNavLibrary.addEventListener("click", () => (window.location.hash = "#/"));
if (btnBackToLibrary) btnBackToLibrary.addEventListener("click", () => (window.location.hash = "#/"));
if (headerBrandLink) headerBrandLink.addEventListener("click", () => (window.location.hash = "#/"));

// Share/Copy Link Icon
const btnShareSlug = document.getElementById("btn-share-slug");
if (btnShareSlug) {
  btnShareSlug.addEventListener("click", () => {
    if (currentSlug) {
      const url = `${window.location.origin}${window.location.pathname}#/${currentSlug}`;
      navigator.clipboard.writeText(url).then(() => {
        showToast("🔗 Slug link copied to clipboard!");
      });
    }
  });
}

// Instructions Modal Controls
const btnOpenInstructions = document.getElementById("btn-open-instructions");
const btnHeroAddGuide = document.getElementById("btn-hero-add-guide");
const instructionsModalClose = document.getElementById("instructions-modal-close");
const btnCloseInstructionsModal = document.getElementById("btn-close-instructions-modal");
const btnCopyTemplateCode = document.getElementById("btn-copy-template-code");

function openInstructionsModal() {
  if (addPageModal) addPageModal.style.display = "flex";
}
function closeInstructionsModal() {
  if (addPageModal) addPageModal.style.display = "none";
}

if (btnOpenInstructions) btnOpenInstructions.addEventListener("click", openInstructionsModal);
if (btnHeroAddGuide) btnHeroAddGuide.addEventListener("click", openInstructionsModal);
if (instructionsModalClose) instructionsModalClose.addEventListener("click", closeInstructionsModal);
if (btnCloseInstructionsModal) btnCloseInstructionsModal.addEventListener("click", closeInstructionsModal);

// Copy Template Code Handler
if (btnCopyTemplateCode) {
  btnCopyTemplateCode.addEventListener("click", () => {
    const templateCode = `import { ItineraryPage } from "./types";

export const myNewTripPage: ItineraryPage = {
  slug: "my-new-trip",
  title: "My New Vacation Title",
  subtitle: "Destination Subtitle",
  coverEmoji: "🌴",
  coverGradient: "linear-gradient(135deg, #06b6d4, #3b82f6)",
  dates: "July 1 - July 10, 2026",
  destination: "City, Country",
  stats: {
    days: 10,
    budget: "$3,000",
    travelers: 2
  },
  summary: "Brief overview of the vacation trip.",
  schedule: [
    {
      dayNumber: 1,
      date: "Day 1",
      title: "Arrival & Hotel Check-in",
      activities: [
        {
          time: "03:00 PM",
          title: "Check into Hotel",
          description: "Unpack and relax."
        }
      ]
    }
  ],
  reservations: [],
  packingList: [],
  notes: []
};`;

    navigator.clipboard.writeText(templateCode).then(() => {
      showToast("📋 Template code copied to clipboard!");
    });
  });
}

// Menu & Lock Modal Controls
const btnOpenMenu = document.getElementById("btn-open-menu");
const menuModalClose = document.getElementById("menu-modal-close");
const menuBtnAddPage = document.getElementById("menu-btn-add-page");
const menuBtnLock = document.getElementById("menu-btn-lock");

if (btnOpenMenu) {
  btnOpenMenu.addEventListener("click", () => {
    if (travelMenuModal) travelMenuModal.style.display = "flex";
  });
}
if (menuModalClose) {
  menuModalClose.addEventListener("click", () => {
    if (travelMenuModal) travelMenuModal.style.display = "none";
  });
}
if (menuBtnAddPage) {
  menuBtnAddPage.addEventListener("click", () => {
    if (travelMenuModal) travelMenuModal.style.display = "none";
    openInstructionsModal();
  });
}
if (menuBtnLock) {
  menuBtnLock.addEventListener("click", () => {
    logoutTravelUser();
    if (travelMenuModal) travelMenuModal.style.display = "none";
    showToast("🔒 Travel Book Locked.");
    updateAuthUI();
  });
}

// Initialize Application
updateAuthUI();
