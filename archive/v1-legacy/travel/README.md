# Travel Book — Blank Template & Itineraries 📖 ✈️

**Travel Book** is a clean, modern personal travel itinerary planner and library. It organizes travel plans into individual **slug cards** (e.g. `#blank-template`, `#japan-2026`, `#yellowstone-2026`) containing day-by-day activity timelines, flight/hotel booking details, packing checklists, and travel briefing notes.

---

## ⚡ Direct Access (No Password Protection)

- **Zero Password Gate**: Access the blank travel template and itineraries instantly without login or password prompts.
- **Interactive Customization**: Customize days, reservations, packing checklists, and briefing notes live in your browser.
- **Zero Heavy Map Dependencies**: Lightweight, fast itinerary builder experience.


---

## 📄 How to Add a New Page (Copy & Paste Workflow)

Adding a new travel itinerary page is simple and requires only 3 steps:

### Step 1: Duplicate `template.ts`
Navigate to `travel/src/data/pages/` and copy `template.ts`.  
Rename the file to your desired trip slug name (e.g., `paris-2026.ts` or `disney-2026.ts`).

```bash
cp travel/src/data/pages/template.ts travel/src/data/pages/paris-2026.ts
```

### Step 2: Edit Your New Page File
Open your new file (`paris-2026.ts`) and update:
1. `slug`: Set to match your filename without extension (e.g. `slug: "paris-2026"`).
2. `title`, `dates`, `destination`, `stats`: Set trip metadata.
3. `schedule`: Add your day-by-day activities, times, locations, and notes.
4. `reservations`: Add flights, hotel bookings, confirmation codes, and car rentals.

### Step 3: Register in `index.ts`
Open `travel/src/data/pages/index.ts`, import your new page object, and add it to the `allItineraryPages` array:

```ts
import { paris2026Page } from "./paris-2026";

export const allItineraryPages: ItineraryPage[] = [
  japan2026Page,
  yellowstone2026Page,
  paris2026Page, // 👈 Your new page card automatically appears!
  templatePage,
];
```

Save the file! The new card will immediately render on your post-login screen at `/#/paris-2026`.

---

## 🚀 Quick Start (Local Development)

```bash
cd travel
npm install
npm run dev
```

The application will run locally at `http://localhost:3001`.

---

## 📦 Production Build

```bash
cd travel
npm run build
```

Static bundle output will be built into `travel/dist/`.
