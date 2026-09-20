import "./styles.css";
import { Editor, Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import { Trip, TripStatus, TripSection } from "./types/trip";
import { router, RouteState } from "./router";
import { fetchTripsFromPB, fetchTripBySlugFromPB, fetchTripByIdFromPB, saveTripToPB, POCKETBASE_URL, pb } from "./pocketbase";
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
      console.warn("Failed to process SSO token from Hub:", e);
    }
  }

  if (tripId) {
    window.location.hash = `#/trips/${tripId}`;
  }

  if (token || tripId) {
    urlParams.delete("token");
    urlParams.delete("tripId");
    urlParams.delete("trip");
    const newQuery = urlParams.toString();
    const newUrl = window.location.pathname + (newQuery ? "?" + newQuery : "") + window.location.hash;
    window.history.replaceState(null, "", newUrl);
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

// Modal DOM References
const sectionModal = document.getElementById("section-modal");
const sectionModalTitle = document.getElementById("section-modal-title");
const sectionModalClose = document.getElementById("section-modal-close");
const sectionModalCancel = document.getElementById("section-modal-cancel");
const btnDeleteSectionModal = document.getElementById("btn-delete-section-modal") as HTMLButtonElement | null;
const sectionForm = document.getElementById("section-form") as HTMLFormElement | null;

const sectionEditIndexInput = document.getElementById("section-edit-index") as HTMLInputElement | null;
const sectionTitleInput = document.getElementById("section-title-input") as HTMLInputElement | null;
const sectionIconInput = document.getElementById("section-icon-input") as HTMLInputElement | null;
const sectionSlugInput = document.getElementById("section-slug-input") as HTMLInputElement | null;
const sectionContentInput = document.getElementById("section-content-input") as HTMLTextAreaElement | null;

function escapeHtml(str: string): string {
  if (!str) return "";
  return str.replace(/[&<>"']/g, (m) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m] || m;
  });
}

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

// Load Trips strictly from PocketBase DB
function loadTrips(): Trip[] {
  try {
    localStorage.removeItem("travel_pb_cache");
  } catch (e) {}
  return [];
}

// Save Trips State
function saveTripsState() {}

// Sync strictly with PocketBase DB 'trips' Collection
async function syncWithPocketBaseDB() {
  const result = await fetchTripsFromPB();
  if (result.isForbidden) {
    trips = [];
    renderRoute(router.getCurrentRoute());
    return;
  }
  if (result.trips) {
    trips = result.trips;
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
    let found = trips.find(
      (t) => t.id === route.slug || t.slug.toLowerCase() === route.slug?.toLowerCase()
    );

    // Fallback: Query PocketBase DB directly by slug or ID if not in local cache
    if (!found) {
      let pbTrip = await fetchTripBySlugFromPB(route.slug);
      if (!pbTrip) {
        pbTrip = await fetchTripByIdFromPB(route.slug);
      }
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
  document.title = `${trip.title} — Wade USA Field Manual`;

  // Render Header Card
  if (tripHeaderContainer) {
    const statusClass = `status-${trip.status}`;
    tripHeaderContainer.innerHTML = `
      <div class="slug-header-card" style="background: ${trip.coverGradient}">
        <div class="slug-header-top">
          <span class="status-badge ${statusClass}">${trip.status}</span>
          <button id="btn-edit-trip-header-card" class="btn-edit-header" title="Edit Trip Title & Subtitle">
            ✏️ Edit Title
          </button>
        </div>
        <h1 class="slug-header-title">${escapeHtml(trip.title)}</h1>
        <p class="slug-header-sub">${escapeHtml(trip.subtitle || trip.destination)}</p>
        ${trip.summary ? `<p class="slug-header-summary">${escapeHtml(trip.summary)}</p>` : ""}
        <div class="slug-header-stats-row">
          <span class="header-stat-badge">🗓️ ${escapeHtml(trip.dates)}</span>
          ${trip.stats?.days ? `<span class="header-stat-badge">📅 ${trip.stats.days} Days</span>` : ""}
          ${trip.stats?.travelers ? `<span class="header-stat-badge">👥 ${trip.stats.travelers} Travelers</span>` : ""}
        </div>
      </div>
    `;

    tripHeaderContainer.querySelector("#btn-edit-trip-header-card")?.addEventListener("click", () => {
      openTripHeaderModal();
    });
  }

  const activeSections: TripSection[] = trip.sections || [];

  // Render Sticky Table of Contents Sidebar
  if (stickyTocBar) {
    if (activeSections.length === 0) {
      stickyTocBar.innerHTML = `
        <div class="toc-sidebar-header">
          <span>📖</span>
          <span>CONTENTS</span>
        </div>
        <p style="font-size:0.8rem; color:var(--text-dim); padding:0.5rem 0;">No sections yet</p>
      `;
    } else {
      stickyTocBar.innerHTML = `
        <div class="toc-sidebar-header">
          <span>📖</span>
          <span>CONTENTS</span>
        </div>
        ${activeSections.map((sec) => `
          <button class="toc-chip" data-target="section-${sec.slug}">
            ${sec.icon && sec.icon.trim() ? `<span>${sec.icon}</span>` : ""}
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
  }

  // Render Field Manual Continuous Sections
  if (fieldManualSectionsContainer) {
    if (activeSections.length === 0) {
      fieldManualSectionsContainer.innerHTML = `
        <div class="empty-sections-card" style="text-align:center; padding:3.5rem 1.5rem; background:var(--bg-card); border:1px dashed var(--border-color); border-radius:var(--radius-xl);">
          <div style="font-size:3rem; margin-bottom:0.75rem;">📄</div>
          <h3 style="font-size:1.25rem; font-weight:800; margin-bottom:0.4rem; color:var(--text-main);">No Topic Sections Added Yet</h3>
          <p style="color:var(--text-muted); font-size:0.92rem; max-width:480px; margin:0 auto 1.5rem auto;">This travel field book is currently empty. Click below to add your first topic section, flight ops, or emergency cards.</p>
          <button id="btn-empty-add-topic" class="btn-primary" style="display:inline-flex; align-items:center; gap:0.5rem; padding:0.7rem 1.4rem;">➕ Add First Topic Section</button>
        </div>
      `;
      fieldManualSectionsContainer.querySelector("#btn-empty-add-topic")?.addEventListener("click", () => {
        openSectionModal(-1);
      });
    } else {
      fieldManualSectionsContainer.innerHTML = activeSections.map((sec, idx) => `
        <div class="field-manual-section-card" id="section-${sec.slug}">
          <div class="section-card-header">
            <div class="section-card-title-group">
              ${sec.icon && sec.icon.trim() ? `<span class="section-card-icon">${sec.icon}</span>` : ""}
              <h2 class="section-card-title">${escapeHtml(sec.title)}</h2>
            </div>
            <div class="section-card-actions" style="display:flex; align-items:center; gap:6px;">
              ${idx > 0 ? `<button class="btn-move-section-up btn-edit-section" data-index="${idx}" title="Move Section Up">⬆️</button>` : ""}
              ${idx < activeSections.length - 1 ? `<button class="btn-move-section-down btn-edit-section" data-index="${idx}" title="Move Section Down">⬇️</button>` : ""}
              <button class="btn-edit-section" data-index="${idx}" title="Edit Topic Section">
                ✏️ Edit
              </button>
            </div>
          </div>
          <div class="section-card-body">
            ${sec.content}
          </div>
        </div>
      `).join("");

      fieldManualSectionsContainer.querySelectorAll(".btn-move-section-up").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const idx = parseInt((e.currentTarget as HTMLElement).getAttribute("data-index") || "-1", 10);
          if (idx > 0) moveSection(idx, idx - 1);
        });
      });

      fieldManualSectionsContainer.querySelectorAll(".btn-move-section-down").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const idx = parseInt((e.currentTarget as HTMLElement).getAttribute("data-index") || "-1", 10);
          if (idx >= 0 && idx < activeSections.length - 1) moveSection(idx, idx + 1);
        });
      });

      fieldManualSectionsContainer.querySelectorAll(".btn-edit-section:not(.btn-move-section-up):not(.btn-move-section-down)").forEach((btn) => {
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
}

async function moveSection(fromIndex: number, toIndex: number) {
  if (!currentTrip || !currentTrip.sections) return;
  if (fromIndex < 0 || fromIndex >= currentTrip.sections.length) return;
  if (toIndex < 0 || toIndex >= currentTrip.sections.length) return;

  const item = currentTrip.sections.splice(fromIndex, 1)[0];
  currentTrip.sections.splice(toIndex, 0, item);

  saveTripsState();
  renderTripFieldManual(currentTrip);
  showToast(`💾 Moved topic "${item.title}"`);
  await saveTripToPB(currentTrip);
}

// TipTap WYSIWYG Editor Instance & Controls
let tiptapEditor: Editor | null = null;
let isHtmlSourceMode = false;

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
      FlashcardsGrid,
      FlashcardItem,
      FlashcardThai,
      FlashcardEnglish,
    ],
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (event.key === "Tab" && tiptapEditor) {
          if (tiptapEditor.isActive("bulletList") || tiptapEditor.isActive("orderedList")) {
            event.preventDefault();
            if (event.shiftKey) {
              tiptapEditor.chain().focus().liftListItem("listItem").run();
            } else {
              tiptapEditor.chain().focus().sinkListItem("listItem").run();
            }
            return true;
          }
        }
        return false;
      },
    },
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
          case "underline":
            tiptapEditor.chain().focus().toggleUnderline().run();
            break;
          case "strike":
            tiptapEditor.chain().focus().toggleStrike().run();
            break;
          case "highlight":
            tiptapEditor.chain().focus().toggleHighlight().run();
            break;
          case "inline-tag":
          case "code":
            tiptapEditor.chain().focus().toggleCode().run();
            break;
          case "align-left":
            tiptapEditor.chain().focus().setTextAlign("left").run();
            break;
          case "align-center":
            tiptapEditor.chain().focus().setTextAlign("center").run();
            break;
          case "align-right":
            tiptapEditor.chain().focus().setTextAlign("right").run();
            break;
          case "align-justify":
            tiptapEditor.chain().focus().setTextAlign("justify").run();
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
          case "clear-nodes":
            tiptapEditor.chain().focus().clearNodes().unsetAllMarks().run();
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
              .insertContent('<div class="field-callout-box"><p>📌 <strong>Field Callout:</strong> Write important travel notes or alerts here...</p></div><p></p>')
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
    underline: tiptapEditor.isActive("underline"),
    strike: tiptapEditor.isActive("strike"),
    highlight: tiptapEditor.isActive("highlight"),
    "inline-tag": tiptapEditor.isActive("code"),
    "align-left": tiptapEditor.isActive({ textAlign: "left" }),
    "align-center": tiptapEditor.isActive({ textAlign: "center" }),
    "align-right": tiptapEditor.isActive({ textAlign: "right" }),
    "align-justify": tiptapEditor.isActive({ textAlign: "justify" }),
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
let isConfirmingModalDelete = false;

function resetModalDeleteBtn() {
  isConfirmingModalDelete = false;
  if (btnDeleteSectionModal) {
    btnDeleteSectionModal.innerText = "🗑️ Delete Section";
    btnDeleteSectionModal.style.background = "rgba(239, 68, 68, 0.14)";
    btnDeleteSectionModal.style.color = "#f87171";
    btnDeleteSectionModal.style.borderColor = "rgba(239, 68, 68, 0.4)";
    btnDeleteSectionModal.disabled = false;
  }
}

function openSectionModal(editIndex: number = -1) {
  if (!sectionModal || !currentTrip) return;

  if (!tiptapEditor) {
    initTipTapEditor();
  }

  resetModalDeleteBtn();

  const activeSections = (currentTrip.sections && currentTrip.sections.length > 0)
    ? currentTrip.sections
    : [];

  if (sectionEditIndexInput) sectionEditIndexInput.value = editIndex.toString();

  if (editIndex >= 0 && editIndex < activeSections.length) {
    const sec = activeSections[editIndex];
    if (sectionModalTitle) sectionModalTitle.textContent = "✏️ Edit Topic Section";
    if (sectionTitleInput) sectionTitleInput.value = sec.title;
    if (sectionIconInput) sectionIconInput.value = sec.icon || "";
    if (sectionSlugInput) sectionSlugInput.value = sec.slug;
    if (tiptapEditor) tiptapEditor.commands.setContent(sec.content || "<p></p>");
    if (btnDeleteSectionModal) btnDeleteSectionModal.style.display = "inline-flex";
  } else {
    if (sectionModalTitle) sectionModalTitle.textContent = "➕ Add New Topic Section";
    if (sectionTitleInput) sectionTitleInput.value = "";
    if (sectionIconInput) sectionIconInput.value = "";
    if (sectionSlugInput) sectionSlugInput.value = "";
    if (tiptapEditor) tiptapEditor.commands.setContent("<p></p>");
    if (btnDeleteSectionModal) btnDeleteSectionModal.style.display = "none";
  }

  isHtmlSourceMode = false;
  const editorEl = document.getElementById("tiptap-editor-element");
  const htmlSourceEl = document.getElementById("tiptap-html-source") as HTMLTextAreaElement | null;
  const btnSourceToggle = document.querySelector('[data-action="toggle-html-source"]') as HTMLElement | null;
  if (editorEl) editorEl.style.display = "block";
  if (htmlSourceEl) htmlSourceEl.style.display = "none";
  if (btnSourceToggle) {
    btnSourceToggle.classList.remove("is-active");
    btnSourceToggle.innerText = "</> HTML Source Mode";
  }

  sectionModal.style.display = "flex";
  setTimeout(() => {
    tiptapEditor?.commands.focus();
  }, 100);
}

function closeSectionModal() {
  if (sectionModal) sectionModal.style.display = "none";
  resetModalDeleteBtn();
}

if (btnOpenAddSectionModal) btnOpenAddSectionModal.addEventListener("click", () => openSectionModal(-1));
if (sectionModalClose) sectionModalClose.addEventListener("click", closeSectionModal);
if (sectionModalCancel) sectionModalCancel.addEventListener("click", closeSectionModal);

if (btnDeleteSectionModal) {
  btnDeleteSectionModal.addEventListener("click", async () => {
    if (!currentTrip) return;
    const editIndex = sectionEditIndexInput ? parseInt(sectionEditIndexInput.value, 10) : -1;
    if (editIndex < 0 || !currentTrip.sections || editIndex >= currentTrip.sections.length) return;

    const targetSection = currentTrip.sections[editIndex];

    if (!isConfirmingModalDelete) {
      isConfirmingModalDelete = true;
      btnDeleteSectionModal.innerText = "⚠️ Confirm Delete Section?";
      btnDeleteSectionModal.style.background = "rgba(239, 68, 68, 0.4)";
      btnDeleteSectionModal.style.color = "#ffffff";
      btnDeleteSectionModal.style.borderColor = "rgba(239, 68, 68, 0.8)";
      setTimeout(() => {
        if (isConfirmingModalDelete) {
          resetModalDeleteBtn();
        }
      }, 4000);
      return;
    }

    btnDeleteSectionModal.disabled = true;
    btnDeleteSectionModal.innerText = "⏳ Deleting...";

    currentTrip.sections.splice(editIndex, 1);
    saveTripsState();
    closeSectionModal();
    renderTripFieldManual(currentTrip);

    showToast(`💾 Deleting topic "${targetSection.title}"...`);
    const saved = await saveTripToPB(currentTrip);
    if (saved) {
      showToast(`✅ Topic section "${targetSection.title}" deleted from PocketBase DB!`);
    } else {
      showToast(`🗑️ Topic section deleted.`);
    }
  });
}

if (sectionForm) {
  sectionForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentTrip) return;

    if (isHtmlSourceMode) {
      const htmlSourceEl = document.getElementById("tiptap-html-source") as HTMLTextAreaElement | null;
      if (htmlSourceEl && tiptapEditor) {
        tiptapEditor.commands.setContent(htmlSourceEl.value || "<p></p>");
      }
    }

    const editIndex = sectionEditIndexInput ? parseInt(sectionEditIndexInput.value, 10) : -1;
    const title = sectionTitleInput?.value.trim() || "Untitled Section";
    const icon = sectionIconInput ? sectionIconInput.value.trim() : "";
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

// Trip Header Modal References & Handlers
const tripHeaderModal = document.getElementById("trip-header-modal");
const btnOpenEditHeaderModal = document.getElementById("btn-open-edit-header-modal");
const tripHeaderModalClose = document.getElementById("trip-header-modal-close");
const tripHeaderModalCancel = document.getElementById("trip-header-modal-cancel");
const tripHeaderForm = document.getElementById("trip-header-form") as HTMLFormElement | null;

const editTripTitleInput = document.getElementById("edit-trip-title-input") as HTMLInputElement | null;
const editTripSubtitleInput = document.getElementById("edit-trip-subtitle-input") as HTMLInputElement | null;
const editTripDatesInput = document.getElementById("edit-trip-dates-input") as HTMLInputElement | null;
const editTripSummaryInput = document.getElementById("edit-trip-summary-input") as HTMLTextAreaElement | null;

function openTripHeaderModal() {
  if (!currentTrip || !tripHeaderModal) return;
  if (editTripTitleInput) editTripTitleInput.value = currentTrip.title || "";
  if (editTripSubtitleInput) editTripSubtitleInput.value = currentTrip.subtitle || currentTrip.destination || "";
  if (editTripDatesInput) editTripDatesInput.value = currentTrip.dates || "";
  if (editTripSummaryInput) editTripSummaryInput.value = currentTrip.summary || "";

  tripHeaderModal.style.display = "flex";
  setTimeout(() => {
    editTripTitleInput?.focus();
  }, 100);
}

function closeTripHeaderModal() {
  if (tripHeaderModal) tripHeaderModal.style.display = "none";
}

if (btnOpenEditHeaderModal) btnOpenEditHeaderModal.addEventListener("click", openTripHeaderModal);
if (tripHeaderModalClose) tripHeaderModalClose.addEventListener("click", closeTripHeaderModal);
if (tripHeaderModalCancel) tripHeaderModalCancel.addEventListener("click", closeTripHeaderModal);

if (tripHeaderForm) {
  tripHeaderForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentTrip) return;

    const newTitle = editTripTitleInput?.value.trim() || currentTrip.title;
    const newSubtitle = editTripSubtitleInput?.value.trim() || "";
    const newDates = editTripDatesInput?.value.trim() || currentTrip.dates;
    const newSummary = editTripSummaryInput?.value.trim() || "";

    currentTrip.title = newTitle;
    currentTrip.subtitle = newSubtitle;
    currentTrip.destination = newSubtitle || currentTrip.destination;
    currentTrip.dates = newDates;
    currentTrip.summary = newSummary;

    saveTripsState();
    renderTripFieldManual(currentTrip);
    closeTripHeaderModal();

    showToast(`💾 Saving updated title "${newTitle}" to PocketBase DB...`);

    const saved = await saveTripToPB(currentTrip);
    if (saved) {
      showToast(`✅ Trip title updated successfully on PocketBase DB!`);
    } else {
      showToast(`💾 Trip title updated.`);
    }
  });
}

// Top Nav Handlers
if (btnNavDashboard) btnNavDashboard.addEventListener("click", () => router.navigateToDashboard());
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
