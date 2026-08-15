# Iter Viae Core 🧭

**Iter Viae** is a modern, high-contrast tactical trip planning platform designed for precise itinerary management, fuel budgeting, and printable navigation assets.

---

## 🛠️ Repository Components

### 1. `mensa/` — Desktop Itinerary Planner
- **Cross-Platform Desktop App**: Built with Tauri v2, TypeScript, and MapLibre GL.
- **100% Local Trip File Storage**: Saves all itineraries, stops, and schedules locally (`~/Documents/IterViae/trips/*.viae`).
- **Printable Itineraries with Google Maps QR Codes**: One-click printing (Letter, A5, Field Notes size) featuring scannable QR codes for every stop. Scanning a QR code on your phone opens **Google Maps Turn-by-Turn Navigation** directly from your current position!
- **Fuel Budget Planner**: Automatic gas stop distance calculation and expense tracking.

### 2. `tools/faber/` — Map Forge & Tile Engine
- OpenMapTiles vector tile compiler, PBF downloader, hillshade generator, and Valhalla graph extractor.

### 3. `server/` — EasyPanel & Docker Deployment Guide
- Step-by-step instructions for deploying **Valhalla Routing Engine** and **TileServer GL** on **EasyPanel** or Docker (`server/SERVER_SETUP.md`).

---

## 🚀 Quick Start (Mensa Desktop)

```bash
cd mensa
npm install
npm run tauri dev
```

---

## 📄 License
Iter Viae Core — All rights reserved.
