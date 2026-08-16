# Iter Viae Core 🧭

**Iter Viae** is a modern, high-contrast tactical trip planning platform designed for precise itinerary management, online vector map surfaces, fuel budgeting, and printable navigation assets.

---

## 🛠️ Repository Components

### 1. `iterviae/` — Cloud & Mobile Tactical Web Application
- **Universal Web & Mobile App**: Built with Vite, TypeScript, and MapLibre GL.
- **Online Infrastructure Integration**: Connects directly to production tile servers (`tiles.wade-usa.com`), Valhalla routing (`valhalla.wade-usa.com`), and Directus Cloud Data API (`api.wade-usa.com`).
- **Android PWA & Mobile Ready**: Full support for touch gestures, responsive navigation, and progressive web installation.
- **Printable Itineraries with Google Maps QR Codes**: High-contrast B&W Letter logbook prints featuring scannable QR codes for turn-by-turn navigation.

### 2. `server/` — EasyPanel & Docker Deployment Guide
- Step-by-step instructions for deploying **Valhalla Routing Engine**, **TileServer GL**, and **Directus CMS** on **EasyPanel** or Docker (`server/SERVER_SETUP.md`).

### 3. `tools/` — Map Forge & Tile Engine Utilities
- Vector tile utilities, PBF converters, and map processing scripts.

---

## 🚀 Quick Start (Iter Viae Web App)

```bash
cd iterviae
npm install
npm run dev
```

---

## 📄 License
Iter Viae Core — All rights reserved.
