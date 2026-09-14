# PocketBase DB Setup Guide for `travel` Collection 🗄️

To connect your **Travel Application** (`travel.wade-usa.com`) to your PocketBase database (`https://api.wade-usa.com`), create the **`travel`** collection (separate from the `trips` collection used by the Iter Viae mapping app).

---

## 🛠️ Step 1: Create the `travel` Collection

1. Open PocketBase Admin UI: **`https://api.wade-usa.com/_/`**
2. In the left sidebar, click **`+ New collection`**:
   - **Name**: `travel`
   - **Type**: Base collection

---

## 📋 Step 2: Add Collection Fields

Add the following fields to the `travel` collection:

| Field Name | Type | Options / Settings | Description |
| :--- | :--- | :--- | :--- |
| **`slug`** | `Text` | Check **`Nonempty`** | Direct URL slug identifier (e.g. `thailand-2027`) |
| **`title`** | `Text` | Check **`Nonempty`** | Main Trip Title (e.g. `Thailand Field Manual 🇹🇭`) |
| **`subtitle`** | `Text` | Required: `No` | Subtitle / Region (e.g. `Bangkok, Chiang Mai & Islands`) |
| **`destination`** | `Text` | Required: `Yes` | Destination Name |
| **`dates`** | `Text` | Required: `Yes` | Trip Date Range string |
| **`status`** | `Select` | Values: `active`, `upcoming`, `archive` (Default: `active`) | Trip lifecycle status |
| **`coverEmoji`** | `Text` | Required: `No` | Header cover emoji (e.g. `🏝️`) |
| **`coverGradient`** | `Text` | Required: `No` | Gradient CSS string |
| **`summary`** | `Text` | Required: `No` | High level overview summary |
| **`stats`** | `JSON` | Required: `No` | JSON object for `{ days, budget, travelers, season }` |
| **`schedule`** | `JSON` | Required: `No` | Array of DaySchedule objects |
| **`reservations`** | `JSON` | Required: `No` | Array of Flight/Hotel reservation objects |
| **`packingList`** | `JSON` | Required: `No` | Array of Packing category checklist objects |
| **`notes`** | `JSON` | Required: `No` | Array of field note strings |

---

## 🔓 Step 3: Set Public Read API Rules (Direct Link Access)

To ensure direct links sent to family (e.g. `https://travel.wade-usa.com/#/trips/thailand-2027`) load directly without requiring login, set the API rules in PocketBase as follows:

| Action | API Rule Filter Expression | Description |
| :--- | :--- | :--- |
| **List/Search** | `""` *(Leave empty string)* | **Public Read** — anyone can browse travel itineraries on dashboard |
| **View** | `""` *(Leave empty string)* | **Public Read** — direct route links load instantly |
| **Create** | `@request.auth.id != ""` | Admin/Authenticated user can create new travel routes |
| **Update** | `@request.auth.id != ""` | Admin/Authenticated user can update travel details |
| **Delete** | `@request.auth.id != ""` | Admin/Authenticated user can delete travel routes |

---

## ⚡ Direct API Verification

Once created, you can test querying your PocketBase DB endpoints:
- List all travel records: `https://api.wade-usa.com/api/collections/travel/records`
- Get single travel itinerary by slug: `https://api.wade-usa.com/api/collections/travel/records?filter=(slug='thailand-2027')`
