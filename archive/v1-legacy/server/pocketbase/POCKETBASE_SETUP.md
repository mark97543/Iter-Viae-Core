# Iter Viae PocketBase Backend Deployment & Setup Guide ⚡

PocketBase is an ultra-fast, 100% open-source backend with zero paywalls on authentication, OAuth, or collection permissions.

---

## 🛠️ Step 1: Deploy PocketBase on EasyPanel

### Method 1: Deploy Directly from GitHub Repository (Recommended)
1. Log in to **EasyPanel** (`https://easypanel.wade-usa.com`).
2. Open project `iter-viae` -> Click **`+ Service`** -> Select **App (GitHub Repository)**.
3. Connect your GitHub account and select repository:
   - **Repository**: `mark97543/Iter-Viae-Core`
   - **Branch**: `main`
   - **Build Path / Root Directory**: `server/pocketbase`
4. EasyPanel will automatically detect `server/pocketbase/Dockerfile`.
5. Under **Domains**:
   - Add Domain: `api.wade-usa.com` (Container Port `8090`, HTTPS Enabled).
6. Under **Mounts / Volumes**:
   - **Type**: Select **`Volume`** (do NOT select `Bind`).
   - **Name**: `pb_data`
   - **Mount Path**: `/pb_data`
7. Click **Deploy**.

> 💡 **Why `Volume` instead of `Bind`**: Choosing `Bind` requires creating a directory on the server host disk first. Selecting **`Volume`** lets Docker automatically manage creating the persistent volume for PocketBase data (`/pb_data`).

---

### Method 2: Deploy Using Docker Image (Fastest)
1. In EasyPanel, click **`+ Service`** -> Select **Docker Image**.
   - **Service Name**: `pocketbase`
   - **Docker Image**: `ghcr.io/muchweb/pocketbase:latest`
   - **Port**: Set Container Port to `8090` -> Map to `api.wade-usa.com` (HTTPS SSL enabled).
   - **Mounts / Volumes**: Type **`Volume`**, Name `pb_data`, Mount Path `/pb_data`.
2. Click **Deploy**.

---

## 🔑 Step 2: Create Admin Account

1. Open your browser and navigate to:
   **`https://api.wade-usa.com/_/`**
2. PocketBase will prompt you to create your **Super Admin Account**:
   - **Email**: `mark@wade-usa.com` (Your Admin email)
   - **Password**: Set your secure Admin password.
3. Click **Create and login**.

---

## 🗄️ Step 3: Create the `trips` Collection with User-Isolated Rules

1. In the PocketBase Admin UI (`/_/`), click **`+ New collection`** in the left sidebar:
   - **Name**: `trips`
   - **Type**: Base collection

2. Add Fields to `trips`:
   - **`user`**: Type `Relation` -> Target Collection `users` -> Max Select `1`.
   - **`title`**: Type `Text` -> Required: `Yes`.
   - **`status`**: Type `Select` -> Values: `draft`, `active`, `archived` -> Default: `active`.
   - **`waypoints`**: Type `JSON` -> Stores array of waypoint objects.
   - **`route_geometry`**: Type `JSON` -> Stores decoded Valhalla route line.
   - **`metrics`**: Type `JSON` -> Stores total distance, duration, budget metrics.

---

## 🔒 Step 4: Configure 100% Free User Isolation API Rules

In the collection settings for `trips`, click **API Rules**:

| Action | API Rule Filter Expression | Description |
| :--- | :--- | :--- |
| **List/Search** | `@request.auth.id != "" && user = @request.auth.id` | Users can only search/list **their own trips**. |
| **View** | `@request.auth.id != "" && user = @request.auth.id` | Users can only view details of **their own trips**. |
| **Create** | `@request.auth.id != "" && @request.data.user = @request.auth.id` | Users can only create trips assigned to themselves. |
| **Update** | `@request.auth.id != "" && user = @request.auth.id` | Users can only edit **their own trips**. |
| **Delete** | `@request.auth.id != "" && user = @request.auth.id` | Users can only delete **their own trips**. |

Click **Save changes**.

---

## 🚫 Step 5: How to Suspend a User (100% Free)

To suspend an abusive or disabled user account:
1. Open PocketBase Admin UI (`/_/`) -> Click **`users`** collection.
2. Select the user's record.
3. Uncheck **`Verified`** OR set **`tokenKey`** to invalidate their active sessions.

---

## 🌐 OAuth2 Google Login (Optional 1-Click SSO)

To enable 1-click **Sign in with Google**:
1. Go to PocketBase Admin UI (`/_/`) -> **Settings (⚙️)** -> **Auth providers**.
2. Enable **Google**:
   - Paste your **Client ID** and **Client Secret** from Google Cloud Console.
3. Click **Save**. PocketBase automatically handles Google logins for free!
