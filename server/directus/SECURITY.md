# Iter Viae Directus Security & Role Setup Guide 🔒

This guide provides step-by-step instructions for configuring **Directus Roles, User Isolation (Row-Level Security), and Suspension Rules** on your Directus instance (`https://api.wade-usa.com`).

---

## 🎯 Target User Roles

You will configure 3 user tiers in the Directus Admin Console:

| Role Name | Access Level | Description |
| :--- | :--- | :--- |
| **`Administrator`** | **Full System Access** | You (Mark). Full access to Directus console, users, collections, and server APIs. |
| **`User`** | **User-Isolated Access** | Standard users. Can create, edit, view, and delete **only their own trips**. |
| **`Suspended`** | **Blocked / Revoked Access** | Disabled users. All API permissions set to **Denied**. |

---

## 🛠️ Step-by-Step Directus Setup Guide

### Step 1: Log in to Directus Admin Panel
1. Open your browser and navigate to **`https://api.wade-usa.com/admin`**.
2. Log in with your **Administrator** credentials.

---

### Step 2: Create the 3 Roles in Directus

1. In the left navigation sidebar, click **Settings (⚙️)** -> **Roles & Permissions**.
2. Click the **`+` (Create Role)** button at the top right:
   - **Role 1: `User`**
     - **Name**: `User`
     - **Description**: `Standard Iter Viae platform user.`
     - **App Access**: Disabled (or enabled if you want them to log into Admin UI).
     - Save the role.
   - **Role 2: `Suspended`**
     - **Name**: `Suspended`
     - **Description**: `Suspended user account with all permissions revoked.`
     - **App Access**: Disabled.
     - Save the role.

---

### Step 3: Create the `trips` Collection

1. In the sidebar, click **Settings (⚙️)** -> **Data Model**.
2. Click **`+` Create Collection**:
   - **Collection Name**: `trips`
   - **Primary Key Type**: `UUID`
   - **System Fields**: Check the boxes for **`User Created`**, **`User Updated`**, **`Date Created`**, and **`Date Updated`**.
3. Add the following fields to the `trips` collection:
   - **`title`**: Type `String` (Input UI)
   - **`status`**: Type `String` (Dropdown: `draft`, `active`, `archived`)
   - **`waypoints`**: Type `JSON` (JSON code editor UI)
   - **`route_geometry`**: Type `JSON` (GeoJSON line string)
   - **`metrics`**: Type `JSON` (Distance, duration, budget metrics)
4. Click **Save**.

---

### Step 4: Configure User-Isolated Row-Level Security (RLS)

Now configure the rule ensuring users can **ONLY see and edit their own trips**:

1. Go to **Settings (⚙️)** -> **Roles & Permissions** -> Click on the **`User`** role.
2. Scroll down to **Collections** -> Click on the **`trips`** collection row.
3. Configure the 5 permission action columns as follows:

#### A. Read (View Trips)
- Set to **`Use Custom`**:
  - Click **Item Permissions** -> Add Filter:
  - Select: `User Created` **`Equals`** `$CURRENT_USER`
  - **Field Permissions**: Select All fields (`title`, `waypoints`, `metrics`, etc.).

#### B. Create (Add Trips)
- Set to **`All Items`** (or Custom).
- Field Permissions: Select All fields.

#### C. Update (Edit Trips)
- Set to **`Use Custom`**:
  - Click **Item Permissions** -> Add Filter:
  - Select: `User Created` **`Equals`** `$CURRENT_USER`

#### D. Delete (Remove Trips)
- Set to **`Use Custom`**:
  - Click **Item Permissions** -> Add Filter:
  - Select: `User Created` **`Equals`** `$CURRENT_USER`

4. Click **Save Permissions**.

---

### Step 5: Configure the `Suspended` Role (Zero Access)

1. Go to **Settings (⚙️)** -> **Roles & Permissions** -> Click on the **`Suspended`** role.
2. Ensure **EVERY collection icon is set to Red (Denied)**.
3. If a suspended user attempts to log in or query the API, Directus will respond with `HTTP 403 Forbidden`.

---

### Step 6: Public Registration Default Role Setting

1. Go to **Settings (⚙️)** -> **Project Settings**.
2. Scroll down to **User Registration**:
   - Check **Allow Public Registration**.
   - **Default Role**: Select **`User`**.
3. Click **Save**.

---

## 🚫 How to Suspend or Reinstate a User

To suspend an abusive or inactive user:
1. Open Directus Admin Console -> **User Directory (👥)**.
2. Click on the target user's account.
3. In the **Role** dropdown:
   - Change their role from **`User`** to **`Suspended`**.
   - (Optional) Set **Status** to `Suspended`.
4. Click **Save**. The user is immediately blocked across Web & Mobile apps!

To reinstate them, change their role back to **`User`**.
