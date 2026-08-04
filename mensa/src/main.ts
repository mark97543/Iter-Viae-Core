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

// Mapbox Official Pre-made Theme Palettes
const MAPBOX_THEMES: Record<string, ThemeConfig> = {
  "streets": {
    bg: "#f8f9fb",
    landcover: "#c2e9c6",
    landuse: "#edf0f5",
    park: "#b8ebbe",
    water: "#a0c8f0",
    waterway: "#7cb5ec",
    building: "#e1e5eb",
    buildingBorder: "#d1d7e0",
    boundary: "#939eb0",
    minorRoad: "#ffffff",
    secondaryRoad: "#ffffff",
    primaryRoad: "#fcd6a4",
    motorway: "#f99d79",
    text: "#333333",
    halo: "#ffffff",
  },
  "outdoors": {
    bg: "#eaf0e6",
    landcover: "#bce3c5",
    landuse: "#dfe9db",
    park: "#a9dfbf",
    water: "#85c1e9",
    waterway: "#5adeeb",
    building: "#d5dbdb",
    buildingBorder: "#c7cece",
    boundary: "#7f8c8d",
    minorRoad: "#ffffff",
    secondaryRoad: "#ffffff",
    primaryRoad: "#f7dc6f",
    motorway: "#eb984e",
    text: "#1e8449",
    halo: "#ffffff",
  },
  "default": {
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
    motorway: "#f59e0b",
    text: "#d9d9d9",
    halo: "#191a1a",
  },
};

function applyTheme(map: maplibregl.Map, themeId: string) {
  const theme = MAPBOX_THEMES[themeId] || MAPBOX_THEMES["streets"];

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

  const defaultTheme = MAPBOX_THEMES["streets"];

  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      name: "Mensa Mapbox Theme Engine",
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
    minZoom: 4.0,
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
