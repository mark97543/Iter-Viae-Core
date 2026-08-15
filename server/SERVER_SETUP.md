# Iter Viae : Complete EasyPanel & Server Deployment Guide 🚀

This is a comprehensive, step-by-step guide for building offline map data locally and deploying the **Valhalla Routing Engine** and **TileServer GL** on a fresh Linux server using **EasyPanel** (Docker-based control panel).

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    LOCAL WORKSTATION                    │
│   Builds map.mbtiles (Vector) & routing.tar (Valhalla)   │
└────────────────────────────┬────────────────────────────┘
                             │ rsync / scp upload
                             ▼
┌─────────────────────────────────────────────────────────┐
│                    EASYPANEL SERVER                     │
│  ┌──────────────────────┐    ┌──────────────────────┐   │
│  │   TileServer GL      │    │   Valhalla Router    │   │
│  │   Port: 8080         │    │   Port: 8002         │   │
│  │   /data/map.mbtiles  │    │   /custom_files      │   │
│  └──────────▲───────────┘    └──────────▲───────────┘   │
└─────────────┼───────────────────────────┼───────────────┘
              │ Vector Tiles              │ Turn-by-Turn
              └─────────────┬─────────────┘
                            │
              ┌─────────────┴─────────────┐
              │   Mensa Desktop App       │
              │  (Saves trips locally)    │
              └───────────────────────────┘
```

---

## 📍 Phase 1: Local Data Build (Workstation)

Run Faber locally on your workstation to forge the map and routing data files before uploading:

1. **Build Vector Map Tiles (`map.mbtiles`)**:
   - Outputs: `map.mbtiles` (~12 GB for North America).
2. **Build Valhalla Routing Graph (`routing.tar` / `valhalla_tiles`)**:
   - Outputs: `routing.tar` (~20 GB for North America).

---

## 🐧 Phase 2: Fresh Server Setup & EasyPanel Installation

Log into your fresh Linux server (Ubuntu 22.04 / 24.04 recommended) via SSH:

```bash
ssh root@YOUR_SERVER_IP
```

### 1. Update Server Packages
```bash
apt update && apt upgrade -y
```

### 2. Install EasyPanel
Run the official 1-command installer:
```bash
curl -sSL https://get.easypanel.io | sh
```

### 3. Open EasyPanel Dashboard
- Open your browser to: `http://YOUR_SERVER_IP:3000`
- Create your **Admin Account** (email & password).
- Create a **New Project** named `iterviae`.

---

## 📤 Phase 3: Upload Local Maps & Routing Data to Server

From your **Local Workstation**, transfer your built map files to the server directories created for EasyPanel:

### 1. Create Server Directories & Upload `map.mbtiles`
```bash
ssh root@YOUR_SERVER_IP "mkdir -p /etc/easypanel/projects/iterviae/tiles"
rsync -P -z /path/to/your/local/map.mbtiles root@YOUR_SERVER_IP:/etc/easypanel/projects/iterviae/tiles/map.mbtiles
```

### 2. Create Server Directories & Upload `routing.tar`
```bash
ssh root@YOUR_SERVER_IP "mkdir -p /etc/easypanel/projects/iterviae/valhalla"
rsync -P -z /path/to/your/local/routing.tar root@YOUR_SERVER_IP:/etc/easypanel/projects/iterviae/valhalla/routing.tar
```

*(If you extracted `routing.tar` into a `valhalla_tiles/` folder, upload the folder directly to `/etc/easypanel/projects/iterviae/valhalla/valhalla_tiles`).*

---

## ⚙️ Phase 4: Configure Services in EasyPanel Dashboard

### Service A: Deploy Valhalla (Routing Engine)

1. In EasyPanel, go to project `iterviae` $\rightarrow$ click **+ Service** $\rightarrow$ select **App** / **Docker Image**.
2. **General Settings**:
   - Name: `valhalla`
   - Image: `ghcr.io/gis-ops/docker-valhalla/valhalla:latest`
3. **Ports**:
   - Click **+ Add Port**
   - Published Port: `8002`
   - Target Port: `8002`
   - Protocol: `tcp`
4. **Environment Variables**:
   - Add Variable: `tile_extract_url` = `https://download.geofabrik.de/north-america-latest.osm.pbf`
   - Add Variable: `force_rebuild` = `false`
5. **Volume Mounts**:
   - Click **+ Add Mount**
   - Type: `Bind`
   - Host Path: `/etc/easypanel/projects/iterviae/valhalla`
   - Mount Path: `/custom_files`
6. Click **Deploy**.

---

### Service B: Deploy TileServer GL (Vector Basemaps)

1. In EasyPanel project `iterviae`, click **+ Service** $\rightarrow$ select **App** / **Docker Image**.
2. **General Settings**:
   - Name: `tileserver`
   - Image: `maptiler/tileserver-gl:latest`
3. **Ports**:
   - Click **+ Add Port**
   - Published Port: `8080`
   - Target Port: `8080`
   - Protocol: `tcp`
4. **Volume Mounts**:
   - Click **+ Add Mount**
   - Type: `Bind`
   - Host Path: `/etc/easypanel/projects/iterviae/tiles`
   - Mount Path: `/data`
5. Click **Deploy**.

---

## 🧪 Phase 5: Verification & Endpoints

### 1. Verify Valhalla Turn-by-Turn Service
Run this command from your terminal or open in browser:
```bash
curl "http://YOUR_SERVER_IP:8002/route?json={\"locations\":[{\"lat\":47.6062,\"lon\":-122.3321},{\"lat\":47.6101,\"lon\":-122.3421}],\"costing\":\"auto\"}"
```
- **Expected Output**: JSON object containing `trip` maneuvers, distance, and polyline `shape`.

### 2. Verify TileServer GL Vector Maps
- Open `http://YOUR_SERVER_IP:8080` in your web browser.
- You will see the TileServer GL dashboard displaying your `map.mbtiles` vector map styles and PBF tile endpoints!

---

## 🔗 Phase 6: Connect Mensa Desktop App

In Mensa Desktop (`mensa/src/main.ts`):
- **Tile Endpoint**: `http://YOUR_SERVER_IP:8080/tiles/{z}/{x}/{y}.pbf`
- **Valhalla Routing Endpoint**: `http://YOUR_SERVER_IP:8002/route`

---

## 🔍 Troubleshooting & Useful Commands

- **Check EasyPanel Service Logs**:
  ```bash
  docker logs -f iterviae-valhalla
  docker logs -f iterviae-tileserver
  ```
- **Restart Services**:
  ```bash
  docker restart iterviae-valhalla
  docker restart iterviae-tileserver
  ```
