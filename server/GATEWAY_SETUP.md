# Key Validation Gateway Setup Guide (`valhalla.wade-usa.com` & `tiles.wade-usa.com`) 🛡️

This guide explains how to deploy the **API Key Validation Gateway** on EasyPanel to enforce real-time key checking against your Directus database for both **Valhalla** and **TileServer GL**.

---

## 🛠️ Step-by-Step EasyPanel Deployment

### 1. Create New Service in EasyPanel
1. Open EasyPanel (`http://46.202.179.124:3000`).
2. Open project **`iterviae`**.
3. Click **+ Service** $\rightarrow$ select **Git Repository**.

---

### 2. Configure Source & Build Settings
- **Service Name**: `gateway`
- **Repository URL**: `https://github.com/mark97543/Iter-Viae-Core.git`
- **Branch**: `main`
- **Build Settings**:
  - **Build Type**: `Dockerfile`
  - **Build Context**: `.` (or leave blank)
  - **Dockerfile Path**: `server/gateway/Dockerfile`

---

### 3. Configure Domains (Routing & Tiles Traffic)
Assign both public domains to the Gateway container on Port **8000**:

#### Domain A (Valhalla Routing):
- **Domain**: `valhalla.wade-usa.com`
- **Container Port**: `8000`
- **HTTPS**: Enabled (Checked)

#### Domain B (TileServer Vector Maps):
- **Domain**: `tiles.wade-usa.com`
- **Container Port**: `8000`
- **HTTPS**: Enabled (Checked)

---

### 4. Configure Volume Mount (under "Mounts" tab)
Mount the Directus database directory so the Gateway reads key statuses in real-time:

- **Mount Type**: `Bind`
- **Host Path**: `/etc/easypanel/projects/iterviae/directus/database`
- **Mount Path**: `/directus/database`

---

### 5. Configure Environment Variables (under "Environment" tab)
Add these exact environment variables:

| Variable Name | Value | Description |
| :--- | :--- | :--- |
| `DB_PATH` | `/directus/database/data.db` | Directus SQLite database file |
| `VALHALLA_HOST` | `http://iterviae_valhalla:8002` | Internal Valhalla service target |
| `TILESERVER_HOST` | `http://iterviae_tileserver:8080` | Internal TileServer service target |

*(Note: In EasyPanel, internal service URLs follow the pattern `http://<project_name>_<service_name>:<port>`).*

---

### 6. Remove Public Domains from Direct Valhalla & TileServer Services
In EasyPanel:
- Go to service **`valhalla`** $\rightarrow$ Domains tab $\rightarrow$ delete `valhalla.wade-usa.com`.
- Go to service **`tileserver`** $\rightarrow$ Domains tab $\rightarrow$ delete `tiles.wade-usa.com`.

*(This ensures all public traffic passes through the Gateway to be key-verified!)*

---

### 7. Click Deploy! 🚀
Click **Deploy**. EasyPanel will build `server/gateway/Dockerfile`, start the Gateway, and enforce real-time key checking!
