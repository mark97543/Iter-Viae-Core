import * as maplibregl from "maplibre-gl";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface ThemeConfig {
  bg: string;
  landcover: string;
  landuse: string;
  park: string;
  water: string;
  waterway: string;
  building: string;
  buildingBorder: string;
  boundary: string;
  minorRoad: string;
  secondaryRoad: string;
  primaryRoad: string;
  motorway: string;
  text: string;
  halo: string;
}

const THEMES: Record<string, ThemeConfig> = {
  "tactical-dark": {
    bg: "#090d16",
    landcover: "#052e16",
    landuse: "#0f172a",
    park: "#064e3b",
    water: "#0a2540",
    waterway: "#1d4ed8",
    building: "#1e293b",
    buildingBorder: "#334155",
    boundary: "#38bdf8",
    minorRoad: "#1e293b",
    secondaryRoad: "#64748b",
    primaryRoad: "#38bdf8",
    motorway: "#f59e0b",
    text: "#f8fafc",
    halo: "#090d16",
  },
  "cyberpunk": {
    bg: "#0d021a",
    landcover: "#19062b",
    landuse: "#150029",
    park: "#003b36",
    water: "#1a0033",
    waterway: "#00f3ff",
    building: "#2a0845",
    buildingBorder: "#ff007f",
    boundary: "#ff007f",
    minorRoad: "#260640",
    secondaryRoad: "#7000ff",
    primaryRoad: "#00f3ff",
    motorway: "#ff007f",
    text: "#00f3ff",
    halo: "#0d021a",
  },
  "satellite-night": {
    bg: "#020617",
    landcover: "#0f172a",
    landuse: "#0b0f19",
    park: "#042f2e",
    water: "#030712",
    waterway: "#2563eb",
    building: "#1e293b",
    buildingBorder: "#475569",
    boundary: "#f59e0b",
    minorRoad: "#1e293b",
    secondaryRoad: "#3b82f6",
    primaryRoad: "#60a5fa",
    motorway: "#eab308",
    text: "#e2e8f0",
    halo: "#020617",
  },
  "midnight-command": {
    bg: "#000000",
    landcover: "#041c0d",
    landuse: "#05130b",
    park: "#062e14",
    water: "#020b06",
    waterway: "#15803d",
    building: "#0d2615",
    buildingBorder: "#166534",
    boundary: "#4ade80",
    minorRoad: "#0d2615",
    secondaryRoad: "#15803d",
    primaryRoad: "#22c55e",
    motorway: "#4ade80",
    text: "#86efac",
    halo: "#000000",
  },
  "monochrome-stealth": {
    bg: "#0a0a0a",
    landcover: "#171717",
    landuse: "#121212",
    park: "#262626",
    water: "#171717",
    waterway: "#525252",
    building: "#262626",
    buildingBorder: "#404040",
    boundary: "#a3a3a3",
    minorRoad: "#262626",
    secondaryRoad: "#737373",
    primaryRoad: "#d4d4d4",
    motorway: "#ffffff",
    text: "#f5f5f5",
    halo: "#0a0a0a",
  },
  "matrix-terminal": {
    bg: "#02140a",
    landcover: "#052e18",
    landuse: "#042010",
    park: "#064e29",
    water: "#031a0d",
    waterway: "#059669",
    building: "#064e2b",
    buildingBorder: "#10b981",
    boundary: "#34d399",
    minorRoad: "#064e2b",
    secondaryRoad: "#059669",
    primaryRoad: "#10b981",
    motorway: "#34d399",
    text: "#6ee7b7",
    halo: "#02140a",
  },
  "outdoors-topo": {
    bg: "#141e17",
    landcover: "#1c3323",
    landuse: "#19291e",
    park: "#164e27",
    water: "#0c2a38",
    waterway: "#0284c7",
    building: "#293d30",
    buildingBorder: "#3f5e4a",
    boundary: "#f59e0b",
    minorRoad: "#293d30",
    secondaryRoad: "#4ade80",
    primaryRoad: "#38bdf8",
    motorway: "#d97706",
    text: "#f0fdf4",
    halo: "#141e17",
  },
  "high-contrast-light": {
    bg: "#f8fafc",
    landcover: "#dcfce7",
    landuse: "#f1f5f9",
    park: "#bbf7d0",
    water: "#bae6fd",
    waterway: "#0284c7",
    building: "#cbd5e1",
    buildingBorder: "#94a3b8",
    boundary: "#0284c7",
    minorRoad: "#cbd5e1",
    secondaryRoad: "#64748b",
    primaryRoad: "#2563eb",
    motorway: "#dc2626",
    text: "#0f172a",
    halo: "#ffffff",
  },
  "warm-sepia": {
    bg: "#1c1917",
    landcover: "#292524",
    landuse: "#24201d",
    park: "#362f2b",
    water: "#1c1917",
    waterway: "#d97706",
    building: "#362f2b",
    buildingBorder: "#57534e",
    boundary: "#f59e0b",
    minorRoad: "#362f2b",
    secondaryRoad: "#a8a29e",
    primaryRoad: "#d97706",
    motorway: "#ea580c",
    text: "#fef3c7",
    halo: "#1c1917",
  },
  "nordic-ice": {
    bg: "#0f172a",
    landcover: "#1e293b",
    landuse: "#152035",
    park: "#1e3a8a",
    water: "#1e293b",
    waterway: "#38bdf8",
    building: "#334155",
    buildingBorder: "#475569",
    boundary: "#38bdf8",
    minorRoad: "#334155",
    secondaryRoad: "#818cf8",
    primaryRoad: "#60a5fa",
    motorway: "#38bdf8",
    text: "#f1f5f9",
    halo: "#0f172a",
  },
};

function applyTheme(map: maplibregl.Map, themeId: string) {
  const theme = THEMES[themeId] || THEMES["tactical-dark"];

  if (map.getLayer("background")) map.setPaintProperty("background", "background-color", theme.bg);
  if (map.getLayer("landcover")) map.setPaintProperty("landcover", "fill-color", theme.landcover);
  if (map.getLayer("landuse")) map.setPaintProperty("landuse", "fill-color", theme.landuse);
  if (map.getLayer("park")) map.setPaintProperty("park", "fill-color", theme.park);
  if (map.getLayer("water")) map.setPaintProperty("water", "fill-color", theme.water);
  if (map.getLayer("waterway")) map.setPaintProperty("waterway", "line-color", theme.waterway);
  if (map.getLayer("building")) {
    map.setPaintProperty("building", "fill-color", theme.building);
    map.setPaintProperty("building", "fill-outline-color", theme.buildingBorder);
  }
  if (map.getLayer("boundary")) map.setPaintProperty("boundary", "line-color", theme.boundary);
  if (map.getLayer("transportation_minor")) map.setPaintProperty("transportation_minor", "line-color", theme.minorRoad);
  if (map.getLayer("transportation_secondary")) map.setPaintProperty("transportation_secondary", "line-color", theme.secondaryRoad);
  if (map.getLayer("transportation_primary")) map.setPaintProperty("transportation_primary", "line-color", theme.primaryRoad);
  if (map.getLayer("transportation_motorway")) map.setPaintProperty("transportation_motorway", "line-color", theme.motorway);
  if (map.getLayer("place_label")) {
    map.setPaintProperty("place_label", "text-color", theme.text);
    map.setPaintProperty("place_label", "text-halo-color", theme.halo);
  }
}

// Register custom protocol handler to fetch vector tiles from local MBTiles via Tauri IPC
maplibregl.addProtocol("mbtiles", async (params: maplibregl.RequestParameters) => {
  const cleanUrl = params.url.replace("mbtiles://", "");
  const parts = cleanUrl.split("/");
  if (parts.length < 3) {
    return { data: new ArrayBuffer(0) };
  }

  const z = parseInt(parts[0], 10);
  const x = parseInt(parts[1], 10);
  const y = parseInt(parts[2], 10);

  try {
    const tileData: number[] | null = await invoke("get_tile", { z, x, y });
    if (tileData && tileData.length > 0) {
      const buffer = new Uint8Array(tileData).buffer;
      return { data: buffer };
    }
  } catch (err) {
    console.warn("MBTiles tile fetch notice:", err);
  }

  return { data: new ArrayBuffer(0) };
});

function initMap() {
  const mapContainer = document.getElementById("map");
  if (!mapContainer) return;

  const defaultTheme = THEMES["tactical-dark"];

  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      name: "Mensa Tactical Theme System",
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        openmaptiles: {
          type: "vector",
          tiles: ["mbtiles://{z}/{x}/{y}"],
          minzoom: 0,
          maxzoom: 14
        }
      },
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": defaultTheme.bg }
        },
        {
          id: "landcover",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "landcover",
          paint: { "fill-color": defaultTheme.landcover, "fill-opacity": 0.5 }
        },
        {
          id: "landuse",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "landuse",
          paint: { "fill-color": defaultTheme.landuse, "fill-opacity": 0.8 }
        },
        {
          id: "park",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "park",
          paint: { "fill-color": defaultTheme.park, "fill-opacity": 0.6 }
        },
        {
          id: "water",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "water",
          paint: { "fill-color": defaultTheme.water, "fill-opacity": 1.0 }
        },
        {
          id: "waterway",
          type: "line",
          source: "openmaptiles",
          "source-layer": "waterway",
          paint: {
            "line-color": defaultTheme.waterway,
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1, 14, 3]
          }
        },
        {
          id: "building",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "building",
          paint: {
            "fill-color": defaultTheme.building,
            "fill-outline-color": defaultTheme.buildingBorder,
            "fill-opacity": 0.85
          }
        },
        {
          id: "boundary",
          type: "line",
          source: "openmaptiles",
          "source-layer": "boundary",
          paint: {
            "line-color": defaultTheme.boundary,
            "line-opacity": 0.7,
            "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1, 10, 2],
            "line-dasharray": [3, 2]
          }
        },
        {
          id: "transportation_minor",
          type: "line",
          source: "openmaptiles",
          "source-layer": "transportation",
          filter: ["in", "class", "minor", "service", "track", "residential", "unclassified"],
          paint: {
            "line-color": defaultTheme.minorRoad,
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 2]
          }
        },
        {
          id: "transportation_secondary",
          type: "line",
          source: "openmaptiles",
          "source-layer": "transportation",
          filter: ["in", "class", "secondary", "tertiary"],
          paint: {
            "line-color": defaultTheme.secondaryRoad,
            "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 14, 3]
          }
        },
        {
          id: "transportation_primary",
          type: "line",
          source: "openmaptiles",
          "source-layer": "transportation",
          filter: ["in", "class", "primary"],
          paint: {
            "line-color": defaultTheme.primaryRoad,
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.2, 14, 4]
          }
        },
        {
          id: "transportation_motorway",
          type: "line",
          source: "openmaptiles",
          "source-layer": "transportation",
          filter: ["in", "class", "motorway", "trunk", "expressway"],
          paint: {
            "line-color": defaultTheme.motorway,
            "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.5, 14, 5]
          }
        },
        {
          id: "place_label",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "place",
          layout: {
            "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
            "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 10, 16],
            "text-transform": "uppercase",
            "text-allow-overlap": false
          },
          paint: {
            "text-color": defaultTheme.text,
            "text-halo-color": defaultTheme.halo,
            "text-halo-width": 2
          }
        }
      ]
    },
    center: [-98.5795, 39.8283],
    zoom: 4,
    pitch: 0,
    bearing: 0
  });

  // Add Navigation and Scale controls
  map.addControl(new maplibregl.NavigationControl(), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "imperial" }), "bottom-left");

  // Listen for native Tauri menu theme changes
  listen<string>("menu-change-theme", (event) => {
    if (event.payload) {
      applyTheme(map, event.payload);
    }
  });

  return map;
}

window.addEventListener("DOMContentLoaded", () => {
  initMap();
});
