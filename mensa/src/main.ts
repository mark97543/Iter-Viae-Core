import * as maplibregl from "maplibre-gl";
import { invoke } from "@tauri-apps/api/core";

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
      name: "Mensa Tactical Dark System",
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
        // 1. Deep Void Canvas Background
        {
          id: "background",
          type: "background",
          paint: {
            "background-color": "#090d16"
          }
        },
        // 2. Landmass Cover (Forests & Parks)
        {
          id: "landcover",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "landcover",
          paint: {
            "fill-color": "#052e16",
            "fill-opacity": 0.5
          }
        },
        // 3. Urban & Residential Areas
        {
          id: "landuse",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "landuse",
          paint: {
            "fill-color": "#0f172a",
            "fill-opacity": 0.8
          }
        },
        {
          id: "park",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "park",
          paint: {
            "fill-color": "#064e3b",
            "fill-opacity": 0.6
          }
        },
        // 4. Water Bodies & Oceans
        {
          id: "water",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "water",
          paint: {
            "fill-color": "#0a2540",
            "fill-opacity": 1.0
          }
        },
        {
          id: "waterway",
          type: "line",
          source: "openmaptiles",
          "source-layer": "waterway",
          paint: {
            "line-color": "#1d4ed8",
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1, 14, 3]
          }
        },
        // 5. Buildings (2D & Extrusions)
        {
          id: "building",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "building",
          paint: {
            "fill-color": "#1e293b",
            "fill-outline-color": "#334155",
            "fill-opacity": 0.85
          }
        },
        // 6. State & Country Political Boundaries
        {
          id: "boundary",
          type: "line",
          source: "openmaptiles",
          "source-layer": "boundary",
          paint: {
            "line-color": "#38bdf8",
            "line-opacity": 0.7,
            "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1, 10, 2],
            "line-dasharray": [3, 2]
          }
        },
        // 7. Road Network Hierarchy (Tactical Spectrum)
        {
          id: "transportation_minor",
          type: "line",
          source: "openmaptiles",
          "source-layer": "transportation",
          filter: ["in", "class", "minor", "service", "track", "residential", "unclassified"],
          paint: {
            "line-color": "#1e293b",
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
            "line-color": "#64748b",
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
            "line-color": "#38bdf8",
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
            "line-color": "#f59e0b",
            "line-width": ["interpolate", ["linear"], ["zoom"], 3, 1.5, 14, 5]
          }
        },
        // 8. Place & City Tactical Labels
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
            "text-color": "#f8fafc",
            "text-halo-color": "#090d16",
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
