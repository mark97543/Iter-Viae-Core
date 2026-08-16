# Iter Viae Streamlined Server Deployment Guide 🚀

This guide covers deploying the **Iter Viae 100% Open-Source Cloud Infrastructure** on **EasyPanel** or Docker.

---

## 🏗️ Architecture Overview

EasyPanel automatically handles domain routing, SSL certificates (Let's Encrypt), and reverse proxying directly to your 3 core service containers:

```
                  ┌─────────────────────────────────────┐
                  │          EasyPanel / SSL            │
                  └──────────────────┬──────────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
           ▼                         ▼                         ▼
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│  Vector Tile Server │   │   Valhalla Engine   │   │  PocketBase Backend │
│  tiles.wade-usa.com │   │ valhalla.wade-usa.com│   │   api.wade-usa.com  │
│     (Port 8080)     │   │     (Port 8002)     │   │     (Port 8090)     │
└─────────────────────┘   └─────────────────────┘   └─────────────────────┘
```

---

## 🛠️ Step 1: Deploy PocketBase (Auth & Data Storage)

- **Domain**: `api.wade-usa.com`
- **Docker Image**: `ghcr.io/muchweb/pocketbase:latest`
- **Container Port**: `8090`
- **Volume Mapping**: `/pb_data`
- **Setup Guide**: See [`server/pocketbase/POCKETBASE_SETUP.md`](pocketbase/POCKETBASE_SETUP.md) for collection and API Rule configuration.

---

## 🗺️ Step 2: Deploy Vector TileServer GL (Enable CORS)

- **Domain**: `tiles.wade-usa.com`
- **Docker Image**: `maptiler/tileserver-gl:latest`
- **Container Port**: `8080`
- **Volume Mapping**: `/data` (containing `config.json` and MBTiles files).
- **CORS Configuration (Fixes Browser CORS Errors)**:
  In EasyPanel under Service Settings -> **CMD / Command**:
  Add `--cors` to the command line arguments:
  ```bash
  tileserver-gl --cors -p 8080
  ```
  > 💡 **Result**: Allows web applications on `localhost` or custom web domains to fetch vector tiles and style JSON files cleanly!

---

## ⚡ Step 3: Deploy Valhalla Routing Engine

- **Domain**: `valhalla.wade-usa.com`
- **Docker Image**: `ghcr.io/gis-ops/valhalla:latest`
- **Container Port**: `8002`
- **Volume Mapping**: `/custom_files` (containing extracted routing graph files).

---

## 📄 Summary of Active Endpoints

| Service | Public HTTPS Domain | Port | Function |
| :--- | :--- | :--- | :--- |
| **PocketBase** | `https://api.wade-usa.com` | `8090` | Auth, User Isolation, Trips Database |
| **TileServer GL** | `https://tiles.wade-usa.com` | `8080` | OpenMapTiles Vector `.pbf` tiles (CORS Enabled) |
| **Valhalla Engine** | `https://valhalla.wade-usa.com` | `8002` | Turn-by-Turn Route Calculations |
