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

// 10 Official Pre-made OpenMapTiles Map Themes
const OFFICIAL_THEMES: Record<string, ThemeConfig> = {
  "dark-matter": {
    bg: "#191a1a",
    landcover: "#212323",
    landuse: "#242526",
    park: "#1f2924",
    water: "#121314",
    waterway: "#1e2226",
    building: "#2b2c2d",
    buildingBorder: "#38393a",
    boundary: "#525252",
    minorRoad: "#2b2c2d",
    secondaryRoad: "#383838",
    primaryRoad: "#454545",
    motorway: "#5a5a5a",
    text: "#d9d9d9",
    halo: "#191a1a",
  },
  "positron": {
    bg: "#f2f3f0",
    landcover: "#e8ede9",
    landuse: "#e4e8e5",
    park: "#d6e5d8",
    water: "#cad2d3",
    waterway: "#b3c1c4",
    building: "#d9dedb",
    buildingBorder: "#c6ccc8",
    boundary: "#a8b2b5",
    minorRoad: "#e8ecea",
    secondaryRoad: "#cfd5d8",
    primaryRoad: "#bdc5c8",
    motorway: "#a5b1b5",
    text: "#404040",
    halo: "#ffffff",
  },
  "osm-liberty": {
    bg: "#f8f4f0",
    landcover: "#d2e9d3",
    landuse: "#e9f2d9",
    park: "#c8e7c9",
    water: "#a0cfdf",
    waterway: "#79c2d8",
    building: "#e0d7cd",
    buildingBorder: "#cbbfae",
    boundary: "#c4a3bf",
    minorRoad: "#ffffff",
    secondaryRoad: "#fef0d9",
    primaryRoad: "#fcd6a4",
    motorway: "#e892a2",
    text: "#2c2c2c",
    halo: "#ffffff",
  },
  "fiord-color": {
    bg: "#1e293b",
    landcover: "#1e3a8a",
    landuse: "#172554",
    park: "#1e3a8a",
    water: "#0f172a",
    waterway: "#3b82f6",
    building: "#334155",
    buildingBorder: "#475569",
    boundary: "#38bdf8",
    minorRoad: "#334155",
    secondaryRoad: "#60a5fa",
    primaryRoad: "#38bdf8",
    motorway: "#93c5fd",
    text: "#e2e8f0",
    halo: "#0f172a",
  },
  "klokantech-basic": {
    bg: "#efedde",
    landcover: "#dbe8d3",
    landuse: "#dedbca",
    park: "#c2e0b6",
    water: "#a5c9eb",
    waterway: "#82b2e4",
    building: "#d1cebe",
    buildingBorder: "#bebba9",
    boundary: "#bda892",
    minorRoad: "#ffffff",
    secondaryRoad: "#fde3c4",
    primaryRoad: "#fbd7a1",
    motorway: "#fbb36b",
    text: "#333333",
    halo: "#ffffff",
  },
  "stamen-toner": {
    bg: "#000000",
    landcover: "#000000",
    landuse: "#000000",
    park: "#000000",
    water: "#000000",
    waterway: "#ffffff",
    building: "#222222",
    buildingBorder: "#ffffff",
    boundary: "#ffffff",
    minorRoad: "#333333",
    secondaryRoad: "#888888",
    primaryRoad: "#cccccc",
    motorway: "#ffffff",
    text: "#ffffff",
    halo: "#000000",
  },
  "bright": {
    bg: "#f4f3f0",
    landcover: "#a7d6a5",
    landuse: "#e6e4d5",
    park: "#98d697",
    water: "#73b6e6",
    waterway: "#54a1db",
    building: "#d8d3c5",
    buildingBorder: "#c2bcac",
    boundary: "#a57bb8",
    minorRoad: "#ffffff",
    secondaryRoad: "#fcd6a4",
    primaryRoad: "#f7cb8b",
    motorway: "#e88d8d",
    text: "#222222",
    halo: "#ffffff",
  },
  "kapa": {
    bg: "#202938",
    landcover: "#26354a",
    landuse: "#2a3447",
    park: "#1b3835",
    water: "#161d27",
    waterway: "#2563eb",
    building: "#374151",
    buildingBorder: "#4b5563",
    boundary: "#60a5fa",
    minorRoad: "#374151",
    secondaryRoad: "#4b5563",
    primaryRoad: "#6b7280",
    motorway: "#9ca3af",
    text: "#cbd5e1",
    halo: "#161d27",
  },
  "voyager": {
    bg: "#fbf8f3",
    landcover: "#c1e6c6",
    landuse: "#f0eade",
    park: "#b0e2b7",
    water: "#84c1ec",
    waterway: "#5ea3d6",
    building: "#e8e1d5",
    buildingBorder: "#d6cca8",
    boundary: "#b599c2",
    minorRoad: "#ffffff",
    secondaryRoad: "#ffe0b2",
    primaryRoad: "#ffd180",
    motorway: "#ff9e80",
    text: "#2c3e50",
    halo: "#ffffff",
  },
  "topographic": {
    bg: "#e9ebd8",
    landcover: "#c5e1c5",
    landuse: "#dddfc9",
    park: "#b1d8b1",
    water: "#87c3df",
    waterway: "#62a8cb",
    building: "#d0d2b9",
    buildingBorder: "#bcbe9e",
    boundary: "#8e997a",
    minorRoad: "#ffffff",
    secondaryRoad: "#f6cfb2",
    primaryRoad: "#f1b287",
    motorway: "#e78c64",
    text: "#2b3e2b",
    halo: "#ffffff",
  },
};

function applyTheme(map: maplibregl.Map, themeId: string) {
  const theme = OFFICIAL_THEMES[themeId] || OFFICIAL_THEMES["fiord-color"];

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

  const defaultTheme = OFFICIAL_THEMES["fiord-color"];

  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      name: "Mensa Official OpenMapTiles Theme Engine",
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
          paint: { "fill-color": defaultTheme.landcover, "fill-opacity": 0.6 }
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
    minZoom: 0,
    maxZoom: 4.0,
    pitch: 0,
    bearing: 0
  });

  // Update debug zoom overlay
  const updateZoomDisplay = () => {
    const zoomEl = document.getElementById("zoom-val");
    if (zoomEl) {
      zoomEl.textContent = map.getZoom().toFixed(2);
    }
  };

  map.on("zoom", updateZoomDisplay);
  map.on("load", updateZoomDisplay);

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
