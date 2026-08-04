import * as maplibregl from "maplibre-gl";
import maplibreglWorker from "maplibre-gl/dist/maplibre-gl-worker?worker";
import { invoke } from "@tauri-apps/api/core";

// Bind inline Web Worker for Vite/Tauri bundling to prevent 404 worker fetches
Object.assign(maplibregl, { workerClass: maplibreglWorker });

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

  const map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      name: "Mensa Tactical Dark",
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
          paint: {
            "background-color": "#0b0f19"
          }
        },
        {
          id: "landcover",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "landcover",
          paint: {
            "fill-color": "#062c20",
            "fill-opacity": 0.4
          }
        },
        {
          id: "landuse",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "landuse",
          paint: {
            "fill-color": "#111827",
            "fill-opacity": 0.6
          }
        },
        {
          id: "park",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "park",
          paint: {
            "fill-color": "#064e3b",
            "fill-opacity": 0.5
          }
        },
        {
          id: "water",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "water",
          paint: {
            "fill-color": "#061838",
            "fill-opacity": 1.0
          }
        },
        {
          id: "waterway",
          type: "line",
          source: "openmaptiles",
          "source-layer": "waterway",
          paint: {
            "line-color": "#1e40af",
            "line-width": 1.5
          }
        },
        {
          id: "building",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "building",
          paint: {
            "fill-color": "#1e293b",
            "fill-outline-color": "#334155",
            "fill-opacity": 0.8
          }
        },
        {
          id: "transportation_minor",
          type: "line",
          source: "openmaptiles",
          "source-layer": "transportation",
          filter: ["in", "class", "minor", "service", "track"],
          paint: {
            "line-color": "#1e293b",
            "line-width": 1.2
          }
        },
        {
          id: "transportation_secondary",
          type: "line",
          source: "openmaptiles",
          "source-layer": "transportation",
          filter: ["in", "class", "secondary", "tertiary"],
          paint: {
            "line-color": "#475569",
            "line-width": 2
          }
        },
        {
          id: "transportation_primary",
          type: "line",
          source: "openmaptiles",
          "source-layer": "transportation",
          filter: ["in", "class", "primary", "trunk", "motorway"],
          paint: {
            "line-color": "#f59e0b",
            "line-width": 3
          }
        },
        {
          id: "place_label",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "place",
          layout: {
            "text-field": "{name}",
            "text-font": ["Metropolis Regular", "Noto Sans Regular"],
            "text-size": 13,
            "text-transform": "uppercase"
          },
          paint: {
            "text-color": "#f8fafc",
            "text-halo-color": "#0f172a",
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

  return map;
}

window.addEventListener("DOMContentLoaded", () => {
  initMap();
});
