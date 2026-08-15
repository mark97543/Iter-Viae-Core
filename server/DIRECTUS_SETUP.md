# Directus API & Key Control Center Setup Guide (`api.wade-usa.com`) 🔑

This guide explains how to deploy **Directus** on EasyPanel under your custom domain `https://api.wade-usa.com` to visually manage user API keys, subscriptions, and usage analytics.

---

## 🛠️ Step-by-Step EasyPanel Deployment

### 1. Create New Service in EasyPanel
1. Open EasyPanel (`http://46.202.179.124:3000`).
2. Open project **`iterviae`**.
3. Click **+ Service** $\rightarrow$ select **Git Repository**.

---

### 2. Configure Source & Build Settings
- **Service Name**: `directus`
- **Repository URL**: `https://github.com/mark97543/Iter-Viae-Core.git`
- **Branch**: `main`
- **Build Settings**:
  - **Build Type**: `Dockerfile`
  - **Build Context**: `.` (or leave blank)
  - **Dockerfile Path**: `server/directus/Dockerfile`

---

### 3. Configure Domain (`api.wade-usa.com`)
1. Go to the **Domains** tab.
2. Click **+ Add Domain**.
3. **Domain**: `api.wade-usa.com`
4. **Container Port**: `8055`
5. **HTTPS**: Enabled (EasyPanel automatically issues free Let's Encrypt SSL certificates).

---

### 4. Configure Environment Variables (under "Environment" tab)
Add these required variables:

| Variable Name | Example Value | Description |
| :--- | :--- | :--- |
| `KEY` | `9b1deb4d-3b7d-4bad-9bdd-2b0d7b3d001a` | Random unique UUID string |
| `SECRET` | `5c9f9d2a-8c7a-4a2b-9e1d-3c7f9d1a2b3c` | Random secret key string |
| `ADMIN_EMAIL` | `admin@wade-usa.com` | Your Directus admin login email |
| `ADMIN_PASSWORD` | `YOUR_SECURE_ADMIN_PASSWORD` | Your Directus admin login password |
| `PUBLIC_URL` | `https://api.wade-usa.com` | Public HTTPS domain URL |
| `DB_CLIENT` | `sqlite3` | SQLite database client |
| `DB_FILENAME` | `/directus/database/data.db` | Database file location |

---

### 5. Configure Volume Mounts (under "Mounts" tab)

Add two persistent volume mounts so your database and uploaded assets are saved across restarts:

#### Mount A (Database File Storage):
- **Type**: `Bind`
- **Host Path**: `/etc/easypanel/projects/iterviae/directus/database`
- **Container Path**: `/directus/database`

#### Mount B (Uploads & Assets Storage):
- **Type**: `Bind`
- **Host Path**: `/etc/easypanel/projects/iterviae/directus/uploads`
- **Container Path**: `/directus/uploads`

---

### 6. Click Deploy! 🚀
Click **Deploy**. EasyPanel will pull `server/directus/Dockerfile` from GitHub, launch Directus, and provision `https://api.wade-usa.com`!

---

## 🔑 Accessing Your Directus Control Center

1. Open **`https://api.wade-usa.com/admin`** in your browser.
2. Log in with your `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
3. You will see the **API Keys**, **Request Logs**, and **Subscriptions** collections pre-configured and ready to issue keys!
