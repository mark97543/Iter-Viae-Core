# Iter Viae PocketBase Backend Deployment & Setup Guide ⚡

PocketBase is an ultra-fast, 100% open-source backend with zero paywalls on authentication, OAuth, or collection permissions.

---

## 🛠️ Step 1: Deploy PocketBase (EasyPanel / Docker)

### Option A: Deployment on EasyPanel
1. Log in to your **EasyPanel** dashboard.
2. Click **`+ Project`** -> Name it `iter-viae-backend`.
3. Click **`+ Service`** -> Select **Docker Image**:
   - **Service Name**: `pocketbase`
   - **Docker Image**: `ghcr.io/muchweb/pocketbase:latest`
   - **Port**: Set Container Port to `8090` -> Map to Domain `api.wade-usa.com` (with HTTPS SSL enabled).
   - **Volume**: Add a Persistent Volume mapped to `/pb_data`.
4. Click **Deploy**.

---

### Option B: Deployment via Docker Compose
Run PocketBase on your Linux server using Docker Compose:

```bash
cd server/pocketbase
docker compose up -d
```

PocketBase will start on port `8090`.

---

## 🔑 Step 2: Create Admin Account

1. Open your browser and navigate to:
   **`https://api.wade-usa.com/_/`** (or `http://localhost:8090/_/` for local testing).
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
   - **`user`**: Type `Relation` -> Target Collection `users` -> Max Select `1` (Cascade Delete: Optional).
   - **`title`**: Type `Text` -> Required: `Yes`.
   - **`status`**: Type `Select` -> Values: `draft`, `active`, `archived` -> Default: `active`.
   - **`waypoints`**: Type `JSON` -> Stores array of waypoint objects.
   - **`route_geometry`**: Type `JSON` -> Stores decoded Valhalla route line.
   - **`metrics`**: Type `JSON` -> Stores total distance, duration, budget metrics.

---

## 🔒 Step 4: Configure 100% Free User Isolation API Rules

PocketBase uses clean, powerful API Rule expressions. In the collection settings for `trips`, click **API Rules**:

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
3. Toggle **`Verified`** to `No` OR set **`tokenKey`** / clear their auth record.
4. Or add a custom `is_suspended` boolean field to `users` and update the API Rules:
   > `@request.auth.id != "" && @request.auth.is_suspended != true`

---

## 🌐 OAuth2 Google Login (Optional 1-Click SSO)

To enable 1-click **Sign in with Google**:
1. Go to PocketBase Admin UI (`/_/`) -> **Settings (⚙️)** -> **Auth providers**.
2. Enable **Google**:
   - Paste your **Client ID** and **Client Secret** from Google Cloud Console.
3. Click **Save**. PocketBase automatically handles Google logins for free!
