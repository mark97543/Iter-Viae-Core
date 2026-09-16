import "./styles.css";
import { Editor, Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { Trip, TripStatus, TripSection } from "./types/trip";
import { router, RouteState } from "./router";
import { fetchTripsFromPB, fetchTripBySlugFromPB, saveTripToPB, POCKETBASE_URL, pb } from "./pocketbase";
import { loadLocalFolderTrips } from "./utils/tripLoader";

// Custom TipTap Extensions for Field Manual Preset Components
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

const FlashcardsGrid = Node.create({
  name: "flashcardsGrid",
  group: "block",
  content: "block+",
  defining: true,

  parseHTML() {
    return [{ tag: "div.flashcards-grid" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "flashcards-grid" }), 0];
  },
});

const FlashcardItem = Node.create({
  name: "flashcardItem",
  group: "block",
  content: "block+",
  defining: true,

  parseHTML() {
    return [{ tag: "div.flashcard-item" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "flashcard-item" }), 0];
  },
});

const FlashcardThai = Node.create({
  name: "flashcardThai",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "div.flashcard-th" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "flashcard-th" }), 0];
  },
});

const FlashcardEnglish = Node.create({
  name: "flashcardEnglish",
  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: "div.flashcard-en" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { class: "flashcard-en" }), 0];
  },
});

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
const btnOpenAddSectionModal = document.getElementById("btn-open-add-section-modal");
const headerBrandLink = document.getElementById("header-brand-link");

// Modal DOM References
const sectionModal = document.getElementById("section-modal");
const sectionModalTitle = document.getElementById("section-modal-title");
const sectionModalClose = document.getElementById("section-modal-close");
const sectionModalCancel = document.getElementById("section-modal-cancel");
const sectionForm = document.getElementById("section-form") as HTMLFormElement | null;

const sectionEditIndexInput = document.getElementById("section-edit-index") as HTMLInputElement | null;
const sectionTitleInput = document.getElementById("section-title-input") as HTMLInputElement | null;
const sectionIconInput = document.getElementById("section-icon-input") as HTMLInputElement | null;
const sectionSlugInput = document.getElementById("section-slug-input") as HTMLInputElement | null;
const sectionContentInput = document.getElementById("section-content-input") as HTMLTextAreaElement | null;

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

  // Store activeSections back on trip object for consistent editing
  if (!trip.sections || trip.sections.length === 0) {
    trip.sections = activeSections;
  }

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
    fieldManualSectionsContainer.innerHTML = activeSections.map((sec, idx) => `
      <div class="field-manual-section-card" id="section-${sec.slug}">
        <div class="section-card-header">
          <div class="section-card-title-group">
            ${sec.icon ? `<span class="section-card-icon">${sec.icon}</span>` : ""}
            <h2 class="section-card-title">${sec.title}</h2>
          </div>
          <button class="btn-edit-section" data-index="${idx}" title="Edit Topic Section">
            ✏️ Edit
          </button>
        </div>
        <div class="section-card-body">
          ${sec.content}
        </div>
      </div>
    `).join("");

    fieldManualSectionsContainer.querySelectorAll(".btn-edit-section").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const indexStr = (e.currentTarget as HTMLElement).getAttribute("data-index");
        if (indexStr !== null) {
          const idx = parseInt(indexStr, 10);
          openSectionModal(idx);
        }
      });
    });
  }
}

// TipTap WYSIWYG Editor Instance & Controls
let tiptapEditor: Editor | null = null;

function initTipTapEditor() {
  const container = document.getElementById("tiptap-editor-element");
  if (!container || tiptapEditor) return;

  tiptapEditor = new Editor({
    element: container,
    extensions: [
      StarterKit,
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: "field-rosetta-table",
        },
      }),
      TableRow,
      TableHeader,
      TableCell,
      CalloutBox,
      FlashcardsGrid,
      FlashcardItem,
      FlashcardThai,
      FlashcardEnglish,
    ],
    content: "<p></p>",
    onUpdate: () => {
      updateToolbarActiveStates();
    },
    onSelectionUpdate: () => {
      updateToolbarActiveStates();
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
          case "strike":
            tiptapEditor.chain().focus().toggleStrike().run();
            break;
          case "code":
            tiptapEditor.chain().focus().toggleCode().run();
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
          case "undo":
            tiptapEditor.chain().focus().undo().run();
            break;
          case "redo":
            tiptapEditor.chain().focus().redo().run();
            break;
          case "insert-callout":
            tiptapEditor
              .chain()
              .focus()
              .insertContent('<div class="field-callout-box"><strong>📌 Note:</strong><br/>Enter note details...</div>')
              .run();
            break;
          case "insert-table":
            tiptapEditor
              .chain()
              .focus()
              .insertContent('<table class="field-rosetta-table"><thead><tr><th>Header 1</th><th>Header 2</th></tr></thead><tbody><tr><td>Data 1</td><td>Data 2</td></tr></tbody></table>')
              .run();
            break;
          case "insert-flashcards":
            tiptapEditor
              .chain()
              .focus()
              .insertContent('<div class="flashcards-grid"><div class="flashcard-item"><div class="flashcard-th">ข้อความภาษาไทย</div><div class="flashcard-en">"English Translation"</div></div></div>')
              .run();
            break;
        }
        updateToolbarActiveStates();
      });
    });
  }
}

function updateToolbarActiveStates() {
  if (!tiptapEditor) return;
  const toolbar = document.getElementById("tiptap-toolbar");
  if (!toolbar) return;

  const btnMap: Record<string, boolean> = {
    bold: tiptapEditor.isActive("bold"),
    italic: tiptapEditor.isActive("italic"),
    strike: tiptapEditor.isActive("strike"),
    code: tiptapEditor.isActive("code"),
    "heading-1": tiptapEditor.isActive("heading", { level: 1 }),
    "heading-2": tiptapEditor.isActive("heading", { level: 2 }),
    "heading-3": tiptapEditor.isActive("heading", { level: 3 }),
    paragraph: tiptapEditor.isActive("paragraph"),
    "bullet-list": tiptapEditor.isActive("bulletList"),
    "ordered-list": tiptapEditor.isActive("orderedList"),
    blockquote: tiptapEditor.isActive("blockquote"),
  };

  toolbar.querySelectorAll(".tiptap-btn").forEach((btn) => {
    const action = btn.getAttribute("data-action");
    if (action && btnMap[action] !== undefined) {
      if (btnMap[action]) {
        btn.classList.add("is-active");
      } else {
        btn.classList.remove("is-active");
      }
    }
  });
}

// Section Modal Functions
function openSectionModal(editIndex: number = -1) {
  if (!sectionModal || !currentTrip) return;

  if (!tiptapEditor) {
    initTipTapEditor();
  }

  const activeSections = (currentTrip.sections && currentTrip.sections.length > 0)
    ? currentTrip.sections
    : [];

  if (sectionEditIndexInput) sectionEditIndexInput.value = editIndex.toString();

  if (editIndex >= 0 && editIndex < activeSections.length) {
    const sec = activeSections[editIndex];
    if (sectionModalTitle) sectionModalTitle.textContent = "✏️ Edit Topic Section";
    if (sectionTitleInput) sectionTitleInput.value = sec.title;
    if (sectionIconInput) sectionIconInput.value = sec.icon || "💡";
    if (sectionSlugInput) sectionSlugInput.value = sec.slug;
    if (tiptapEditor) tiptapEditor.commands.setContent(sec.content || "<p></p>");
  } else {
    if (sectionModalTitle) sectionModalTitle.textContent = "➕ Add New Topic Section";
    if (sectionTitleInput) sectionTitleInput.value = "";
    if (sectionIconInput) sectionIconInput.value = "💡";
    if (sectionSlugInput) sectionSlugInput.value = "";
    if (tiptapEditor) tiptapEditor.commands.setContent("<p></p>");
  }

  sectionModal.style.display = "flex";
  setTimeout(() => {
    tiptapEditor?.commands.focus();
  }, 100);
}

function closeSectionModal() {
  if (sectionModal) sectionModal.style.display = "none";
}

if (btnOpenAddSectionModal) btnOpenAddSectionModal.addEventListener("click", () => openSectionModal(-1));
if (sectionModalClose) sectionModalClose.addEventListener("click", closeSectionModal);
if (sectionModalCancel) sectionModalCancel.addEventListener("click", closeSectionModal);

if (sectionForm) {
  sectionForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentTrip) return;

    const editIndex = sectionEditIndexInput ? parseInt(sectionEditIndexInput.value, 10) : -1;
    const title = sectionTitleInput?.value.trim() || "Untitled Section";
    const icon = sectionIconInput?.value.trim() || "💡";
    const rawSlug = sectionSlugInput?.value.trim();
    const slug = rawSlug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const content = tiptapEditor ? tiptapEditor.getHTML() : (sectionContentInput?.value || "");

    if (!currentTrip.sections) currentTrip.sections = [];

    const newSection: TripSection = { slug, title, icon, content };

    if (editIndex >= 0 && editIndex < currentTrip.sections.length) {
      currentTrip.sections[editIndex] = newSection;
    } else {
      currentTrip.sections.push(newSection);
    }

    saveTripsState();
    renderTripFieldManual(currentTrip);
    closeSectionModal();

    showToast(`💾 Saving "${title}" to PocketBase DB...`);

    const saved = await saveTripToPB(currentTrip);
    if (saved) {
      showToast(`✅ Topic "${title}" saved to PocketBase DB!`);
    } else {
      showToast(`💾 Topic section saved locally.`);
    }
  });
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
initTipTapEditor();
const initialRoute = router.getCurrentRoute();
renderRoute(initialRoute);
syncWithPocketBaseDB();
