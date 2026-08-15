# Iter Viae : Complete EasyPanel & Server Setup Guide 🚀

This is the ultimate, step-by-step guide for deploying the **Valhalla Routing Engine** and **TileServer GL** on **EasyPanel** (Docker-based control panel) connected to your GitHub repository ([`https://github.com/mark97543/Iter-Viae-Core.git`](https://github.com/mark97543/Iter-Viae-Core.git)).

---

## 🏗️ System Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                     LOCAL WORKSTATION                       │
│  Compiles map.mbtiles (Vector) & routing.tar (Valhalla)     │
│  Path: /home/mark/Documents/Iter Viae Core/data/maps/      │
└──────────────────────────────┬──────────────────────────────┘
                               │ Upload via ./upload_to_server.sh
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               EASYPANEL SERVER (46.202.179.124)             │
│                                                             │
│  ┌──────────────────────────┐    ┌───────────────────────┐  │
│  │   TileServer GL Service  │    │   Valhalla Service    │  │
│  │   Port: 8080             │    │   Port: 8002          │  │
│  │   Git: server/tileserver │    │   Git: server/valhalla│  │
│  └────────────▲─────────────┘    └───────────▲───────────┘  │
└───────────────┼──────────────────────────────┼──────────────┘
                │ Vector PBF Tiles             │ Turn-by-Turn
                └──────────────┬───────────────┘
                               │
                ┌──────────────┴──────────────┐
                │     Mensa Desktop App       │
                │    (Saves trips locally)    │
                └─────────────────────────────┘
```

---

## 📍 Phase 1: Local Map Data Build (Workstation)

Faber compiles your map files locally on your computer to save server CPU and RAM:

- **Local Compiled Output Directory**:  
  `/home/mark/Documents/Iter Viae Core/data/maps/compiled/`

- **Generated Files**:
  - `map.mbtiles` (~12.15 GB Master OpenMapTiles Vector Map)
  - `routing.tar` (~20.13 GB Valhalla Highway Routing Graph Tiles)

---

## 🐧 Phase 2: Fresh Server Setup & EasyPanel Installation

Connect to your server via SSH:

```bash
ssh root@46.202.179.124
```

### 1. Update Operating System
```bash
apt update && apt upgrade -y
```

### 2. Install EasyPanel
Run the official 1-command installer:
```bash
curl -sSL https://get.easypanel.io | sh
```

### 3. Initialize EasyPanel Dashboard
1. Open your browser to: `http://46.202.179.124:3000`
2. Create your **Admin Account** (Email & Password).
3. On the left sidebar, click **+ Project** and name it `iterviae`.

---

## 📤 Phase 3: Upload Local Maps & Routing Data to Server

> [!IMPORTANT]
> **Run this command from a terminal on your LOCAL WORKSTATION (your computer).**  
> Do **NOT** run it inside the server SSH session.

Run the automated 1-command upload script from your laptop terminal:

```bash
cd "/home/mark/Documents/Iter Viae Core" && ./upload_to_server.sh
```

### What this script does automatically:
- Connects to `root@46.202.179.124`.
- Creates server target folders `/etc/easypanel/projects/iterviae/tiles` and `/etc/easypanel/projects/iterviae/valhalla`.
- Transfers `map.mbtiles` and `routing.tar` with live progress bars.

---

## ⚙️ Phase 4: Detailed EasyPanel Git Service Setup (Click-by-Click) 🐙

### Service 1: Deploy Valhalla (Routing Engine via Git)

1. Open **EasyPanel** at `http://46.202.179.124:3000`.
2. Click project **`iterviae`** on the left menu.
3. Click **+ Service** $\rightarrow$ select **Git Repository**.
4. **Source Settings**:
   - **Service Name**: `valhalla`
   - **Repository URL**: `https://github.com/mark97543/Iter-Viae-Core.git`
   - **Branch**: `main`
5. **Build Settings**:
   - **Build Type**: Select `Dockerfile`
   - **Build Context / Root**: Set to `.` (or leave empty)
   - **Dockerfile Path**: `server/valhalla/Dockerfile`
6. **Domains / Ports Settings (under "Domains" / "Ports" tab)**:
   - *Option A (Direct IP & Port Access)*: Go to **Ports** $\rightarrow$ **+ Add Port** $\rightarrow$ Set Published Port `8002` $\rightarrow$ Target Port `8002` (`TCP`).
   - *Option B (Custom Domain)*: Go to **Domains** $\rightarrow$ **+ Add Domain** $\rightarrow$ Enter `valhalla.yourdomain.com` $\rightarrow$ Set Container Port to `8002`.
7. **Volume Mounts (under "Mounts" tab)**:
   - Click **+ Add Mount**
   - **Type**: `Bind`
   - **Host Path**: `/etc/easypanel/projects/iterviae/valhalla`
   - **Mount Path**: `/custom_files`
8. Click **Deploy**. EasyPanel will pull `server/valhalla/Dockerfile` from GitHub and start Valhalla!

---

### Service 2: Deploy TileServer GL (Vector Maps via Git)

1. Inside project **`iterviae`**, click **+ Service** $\rightarrow$ select **Git Repository**.
2. **Source Settings**:
   - **Service Name**: `tileserver`
   - **Repository URL**: `https://github.com/mark97543/Iter-Viae-Core.git`
   - **Branch**: `main`
3. **Build Settings**:
   - **Build Type**: Select `Dockerfile`
   - **Build Context / Root**: Set to `.` (or leave empty)
   - **Dockerfile Path**: `server/tileserver/Dockerfile`
4. **Domains / Ports Settings (under "Domains" / "Ports" tab)**:
   - *Option A (Direct IP & Port Access)*: Go to **Ports** $\rightarrow$ **+ Add Port** $\rightarrow$ Set Published Port `8080` $\rightarrow$ Target Port `8080` (`TCP`).
   - *Option B (Custom Domain)*: Go to **Domains** $\rightarrow$ **+ Add Domain** $\rightarrow$ Enter `tiles.yourdomain.com` $\rightarrow$ Set Container Port to `8080`.
5. **Volume Mounts (under "Mounts" tab)**:
   - Click **+ Add Mount**
   - **Type**: `Bind`
   - **Host Path**: `/etc/easypanel/projects/iterviae/tiles`
   - **Mount Path**: `/data`
6. Click **Deploy**. EasyPanel will pull `server/tileserver/Dockerfile` from GitHub and start TileServer!

---

## 🧪 Phase 5: Verification & Service Testing

### 1. Test Valhalla Turn-by-Turn Routing Service
Run this command from any terminal or paste the URL into your browser:

```bash
curl "http://46.202.179.124:8002/route?json={\"locations\":[{\"lat\":47.6062,\"lon\":-122.3321},{\"lat\":47.6101,\"lon\":-122.3421}],\"costing\":\"auto\"}"
```
- **Expected Result**: Returns JSON data with decoded polyline road geometry, maneuvers, and travel time.

### 2. Test TileServer GL Vector Maps Service
- Open `http://46.202.179.124:8080` in your web browser.
- You will see the TileServer GL dashboard displaying your `map.mbtiles` vector map styles and live PBF tile preview!

---

## 🔗 Phase 6: Connect Mensa Desktop App

In Mensa Desktop settings (`mensa/src/main.ts`):
- **Map Vector Tiles Endpoint**: `http://46.202.179.124:8080/tiles/{z}/{x}/{y}.pbf`
- **Valhalla Routing Endpoint**: `http://46.202.179.124:8002/route`

---

## 🔍 Helpful Commands & Logs

- **View Live Valhalla Container Logs**:
  ```bash
  docker logs -f iterviae-valhalla
  ```
- **View Live TileServer Container Logs**:
  ```bash
  docker logs -f iterviae-tileserver
  ```
- **Restart All Services**:
  ```bash
  docker restart iterviae-valhalla iterviae-tileserver
  ```
