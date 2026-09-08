# How to Create a New Travel Field Book Trip

Trips are stored as hardcoded, file-based Markdown directories inside `src/trips/<slug>/`. The Vite build engine dynamically discovers every trip folder automatically using `import.meta.glob`.

---

## 📁 Trip Directory Structure

To add a new trip, create a new folder under `src/trips/` named after your trip slug (e.g., `japan-2028` or `utah-national-parks`):

```
travel/src/trips/
└── japan-2028/
    ├── trip.json                 <-- Master Trip Metadata
    ├── flight-ops.md             <-- Flight Operations & Itineraries
    ├── schedule.md               <-- Daily Schedule Itinerary
    ├── accommodations.md         <-- Hotels & Booking Confirmations
    └── travel-tips.md            <-- Field Tricks & Packing Guidelines
```

---

## 🛠️ Step 1: Create `trip.json`

Inside your new trip folder (e.g., `src/trips/japan-2028/trip.json`), create the clean master JSON configuration file:

```json
{
  "slug": "japan-2028",
  "title": "Japan 2028 Expedition Manual",
  "subtitle": "Tokyo, Kyoto & Osaka Field Guide",
  "destination": "Tokyo, Kyoto, Osaka",
  "dates": "Oct 10, 2028 through Oct 25, 2028",
  "status": "upcoming",
  "coverEmoji": "⛩️",
  "coverGradient": "linear-gradient(135deg, #e11d48, #be123c)",
  "summary": "Flight staging, daily itinerary timeline, hotel bookings, and essential field travel tricks.",
  "stats": {
    "days": 15,
    "travelers": 3
  },
  "sections": [
    { "slug": "flight-ops", "title": "Flight Operations & Itineraries", "icon": "✈️", "file": "flight-ops.md" },
    { "slug": "schedule", "title": "Daily Schedule Itinerary", "icon": "📅", "file": "schedule.md" },
    { "slug": "accommodations", "title": "Hotels & Staging Confirmations", "icon": "🏨", "file": "accommodations.md" },
    { "slug": "travel-tips", "title": "Field Travel Tricks & Packing Guidelines", "icon": "💡", "file": "travel-tips.md" }
  ]
}
```

---

## 📄 Step 2: Markdown Section Templates

Copy and customize these templates for your trip files.

---

### Template 1: `flight-ops.md` (Flight Operations & Itineraries)

```markdown
# Flight Operations & Itineraries

Check-in opens **3 hours prior** to departure at international airport staging gates.

- **Baggage Allowance:** 2x 23kg Checked Bags + 1 Carry-on item per traveler.
- **Passports:** Must be valid for at least 6 months past entry date.

> **Flight Segment 1:** Outbound Flight #NH105 (Departure 11:30 AM -> Arrival 3:15 PM Next Day)
> **Flight Segment 2:** Return Flight #NH106 (Departure 5:45 PM -> Arrival 11:20 AM Same Day)
```

---

### Template 2: `schedule.md` (Daily Schedule Itinerary)

```markdown
# Daily Schedule Itinerary

- **Day 1 (Arrival & Staging):** Touchdown, clear customs, collect baggage, pick up IC transit cards, and check in to hotel.
- **Day 2 (City Exploration):** Morning walking tour of main historic district, lunch at central market, afternoon museum visit.
- **Day 3 (Excursion Day):** Early train departure for scenic day trip. Dinner at local tavern.
- **Day 4 (Rest & Free Time):** Open morning for shopping and coffee, evening dinner reservation at 7:00 PM.
```

---

### Template 3: `accommodations.md` (Hotels & Staging Confirmations)

```markdown
# Hotels & Staging Confirmations

| Location | Hotel Name | Confirmation # | Dates |
| --- | --- | --- | --- |
| **Tokyo** | Grand Hyatt Tokyo | CONF-889102 | Oct 10 – Oct 14 |
| **Kyoto** | Kyoto Granbell Hotel | CONF-334192 | Oct 14 – Oct 19 |
| **Osaka** | Swissotel Nankai Osaka | CONF-771029 | Oct 19 – Oct 25 |
```

---

### Template 4: `travel-tips.md` (Field Travel Tricks & Packing Guidelines)

```markdown
# Field Travel Tricks & Packing Guidelines

### 💡 Field Travel Tricks
- **Local Currency:** Keep small bills ($10-$20 equivalent) accessible for taxis and street vendors.
- **Offline Maps:** Download Google Maps region offline on your phone prior to departure.
- **Power Adapters:** Bring universal Type-A / Type-C travel adapters and a 10,000mAh power bank.

### 🎒 Essential Packing Checklist
- Passport, E-Visa printed copy, & COVID/Travel insurance proof.
- Prescription medications (in original bottles with doctor note).
- Comfortable broken-in walking shoes.
- Compact umbrella & light rain jacket.
```

---

## 📊 Step 3: Mobile-Friendly HTML Tables & Helper Classes

You can paste raw HTML tables directly inside any `.md` file for advanced formatting. The build engine automatically wraps all tables in a smooth horizontal touch-scrolling container (`.table-responsive-wrapper`) with a minimum width of `600px`.

### 💡 Utility Helper Classes

- **`.mobile-hide`** (or `.hide-mobile`): Hides long text or extra columns on mobile screens (`@media (max-width: 768px)`).
- **`.desktop-hide`**: Hides elements on desktop screens (`@media (min-width: 769px)`).
- **`.text-center`**, **`.text-right`**, **`.text-left`**: Align text inside table headers (`<th>`) and cells (`<td>`).

---

### Copy-Paste Flight Table Template (with `<tfoot>` notes)

```html
<table>
  <thead>
    <tr>
      <th class="text-center">#</th>
      <th class="text-center">From</th>
      <th class="text-center">To</th>
      <th class="text-center">Flight</th>
      <th class="text-center">Dep</th>
      <th class="text-center">Arr</th>
      <th class="text-center">Seat</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td class="text-center"><b>1</b></td>
      <td class="text-center"><b>IDA</b><br><span class="mobile-hide">Idaho Falls Regional Airport</span></td>
      <td class="text-center"><b>SEA</b><br><span class="mobile-hide">Seattle-Tacoma International Airport</span></td>
      <td class="text-center">Alaska Airlines<br><b>AS211</b></td>
      <td class="text-center"><code>06:15</code></td>
      <td class="text-center"><code>07:11</code></td>
      <td class="text-center"><span class="header-stat-badge">13B</span></td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <td colspan="7" style="background: rgba(0, 0, 0, 0.25); padding: 0.85rem 1rem; border-top: 1px solid var(--border-color);">
        <strong style="color: var(--accent-cyan);">💡 Layover & Baggage Notes:</strong>
        <ul style="margin: 0.4rem 0 0 1.25rem; padding: 0;">
          <li><strong>Layover:</strong> 2 Hour 39 Min Layover at Seattle-Tacoma (SEA).</li>
          <li><strong>Pre-book Bags:</strong> 1st bag is $45 and 2nd bag is $55.</li>
        </ul>
      </td>
    </tr>
  </tfoot>
</table>
```

---

## ⚡ Step 4: Save & View

1. Save your `trip.json` and `.md` files in your new `src/trips/<slug>/` folder.
2. The site will instantly hot-reload and build your trip page at `https://travel.wade-usa.com/#/trips/<slug>`.
