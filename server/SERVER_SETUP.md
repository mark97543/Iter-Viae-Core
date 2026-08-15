# Iter Viae : Server Setup Guide for EasyPanel 🚀

This guide provides step-by-step instructions for deploying the **Valhalla Routing Engine** and **TileServer GL** on your server using **EasyPanel** (Docker-based control panel).

---

## 📋 Overview of Server Architecture

- **Valhalla Routing Engine** (`Port 8002`):
  - Calculates turn-by-turn road curves, distance, and ETAs.
- **TileServer GL** (`Port 8080`):
  - Serves OpenMapTiles vector basemaps (`map.mbtiles`) to Mensa.

---

## 🛠️ Step-by-Step EasyPanel Deployment

### Step 1: Create a Project in EasyPanel
1. Open your **EasyPanel Dashboard** (`https://your-easypanel-domain.com`).
2. Click **+ Project** and name it `iterviae`.

---

### Step 2: Deploy Valhalla (Routing Service)

1. Inside the `iterviae` project, click **+ Service** $\rightarrow$ select **App** / **Docker Image**.
2. **Name**: `valhalla`
3. **Docker Image**: `ghcr.io/gis-ops/docker-valhalla/valhalla:latest`
4. **Port**: Add port mapping:
   - Target Port: `8002`
   - Published Port: `8002`
5. **Environment Variables**:
   - `tile_extract_url` = `https://download.geofabrik.de/north-america-latest.osm.pbf` (or your regional OSM file)
   - `force_rebuild` = `false`
6. **Volumes / Mounts**:
   - Host Path: `/etc/easypanel/projects/iterviae/valhalla`
   - Container Path: `/custom_files`
   - *(Copy your `routing.tar` or extracted `valhalla_tiles` into this folder)*
7. Click **Deploy**.

---

### Step 3: Deploy TileServer GL (Vector Basemap Service)

1. Click **+ Service** $\rightarrow$ select **App** / **Docker Image**.
2. **Name**: `tileserver`
3. **Docker Image**: `maptiler/tileserver-gl:latest`
4. **Port**: Add port mapping:
   - Target Port: `8080`
   - Published Port: `8080`
5. **Volumes / Mounts**:
   - Host Path: `/etc/easypanel/projects/iterviae/tiles`
   - Container Path: `/data`
   - *(Place your `map.mbtiles` file inside this folder)*
6. Click **Deploy**.

---

## 🔗 Connecting Mensa Desktop to EasyPanel

In Mensa Desktop settings (`mensa/src/main.ts`):
- **Valhalla Routing Endpoint**: `http://YOUR_SERVER_IP:8002/route` (or `https://valhalla.yourdomain.com/route`)
- **Map Vector Tiles Endpoint**: `http://YOUR_SERVER_IP:8080/tiles/{z}/{x}/{y}.pbf` (or `https://tiles.yourdomain.com/tiles/{z}/{x}/{y}.pbf`)

---

## 🧪 Verification

1. **Test Valhalla**:
   ```bash
   curl "http://YOUR_SERVER_IP:8002/route?json={\"locations\":[{\"lat\":47.6062,\"lon\":-122.3321},{\"lat\":47.6101,\"lon\":-122.3421}],\"costing\":\"auto\"}"
   ```
2. **Test TileServer**:
   Open `http://YOUR_SERVER_IP:8080` in your web browser to view your vector map live!
