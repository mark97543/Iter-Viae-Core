import * as maplibregl from "maplibre-gl";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

function applyTheme(map: maplibregl.Map, themeId: string) {
  if (themeId === "3d-buildings") {
    // 1. 3D Buildings Mode (Camera pitch 60°, hardware extruded building blocks)
    map.setTerrain(null);
    map.easeTo({ pitch: 60, bearing: -17.6, duration: 1200 });

    if (map.getLayer("building_2d")) map.setLayoutProperty("building_2d", "visibility", "none");
    if (map.getLayer("building_3d")) map.setLayoutProperty("building_3d", "visibility", "visible");
    if (map.getLayer("hillshade")) map.setLayoutProperty("hillshade", "visibility", "none");

    if (map.getLayer("background")) map.setPaintProperty("background", "background-color", "#0b0f19");
    if (map.getLayer("landcover")) map.setPaintProperty("landcover", "fill-color", "#062c20");
    if (map.getLayer("landuse")) map.setPaintProperty("landuse", "fill-color", "#111827");
    if (map.getLayer("water")) map.setPaintProperty("water", "fill-color", "#061838");
    if (map.getLayer("boundary")) map.setPaintProperty("boundary", "line-color", "#38bdf8");
    if (map.getLayer("transportation_primary")) map.setPaintProperty("transportation_primary", "line-color", "#38bdf8");
    if (map.getLayer("transportation_motorway")) map.setPaintProperty("transportation_motorway", "line-color", "#f59e0b");
  } else if (themeId === "3d-terrain") {
    // 2. 3D Mountain Terrain Mode (Camera pitch 62°, true 3D WebGL terrain mesh + elevation relief)
    map.setTerrain({ source: "terrain_dem", exaggeration: 1.8 });
    map.easeTo({ pitch: 62, bearing: 15, duration: 1400 });

    if (map.getLayer("building_2d")) map.setLayoutProperty("building_2d", "visibility", "visible");
    if (map.getLayer("building_3d")) map.setLayoutProperty("building_3d", "visibility", "none");
    if (map.getLayer("hillshade")) map.setLayoutProperty("hillshade", "visibility", "visible");

    if (map.getLayer("background")) map.setPaintProperty("background", "background-color", "#141e17");
    if (map.getLayer("landcover")) map.setPaintProperty("landcover", "fill-color", "#1c3323");
    if (map.getLayer("landuse")) map.setPaintProperty("landuse", "fill-color", "#19291e");
    if (map.getLayer("water")) map.setPaintProperty("water", "fill-color", "#0c2a38");
    if (map.getLayer("boundary")) map.setPaintProperty("boundary", "line-color", "#f59e0b");
    if (map.getLayer("transportation_primary")) map.setPaintProperty("transportation_primary", "line-color", "#38bdf8");
    if (map.getLayer("transportation_motorway")) map.setPaintProperty("transportation_motorway", "line-color", "#d97706");
  } else {
    // 3. 2D Basic Tactical Mode (Default flat 2D top-down view)
    map.setTerrain(null);
    map.easeTo({ pitch: 0, bearing: 0, duration: 1200 });

    if (map.getLayer("building_2d")) map.setLayoutProperty("building_2d", "visibility", "visible");
    if (map.getLayer("building_3d")) map.setLayoutProperty("building_3d", "visibility", "none");
    if (map.getLayer("hillshade")) map.setLayoutProperty("hillshade", "visibility", "none");

    if (map.getLayer("background")) map.setPaintProperty("background", "background-color", "#090d16");
    if (map.getLayer("landcover")) map.setPaintProperty("landcover", "fill-color", "#052e16");
    if (map.getLayer("landuse")) map.setPaintProperty("landuse", "fill-color", "#0f172a");
    if (map.getLayer("water")) map.setPaintProperty("water", "fill-color", "#0a2540");
    if (map.getLayer("boundary")) map.setPaintProperty("boundary", "line-color", "#38bdf8");
    if (map.getLayer("transportation_primary")) map.setPaintProperty("transportation_primary", "line-color", "#38bdf8");
    if (map.getLayer("transportation_motorway")) map.setPaintProperty("transportation_motorway", "line-color", "#f59e0b");
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

// Register custom protocol handler to fetch DEM elevation tiles from dem.mbtiles via Tauri IPC
maplibregl.addProtocol("dem", async (params: maplibregl.RequestParameters) => {
  const cleanUrl = params.url.replace("dem://", "");
  const parts = cleanUrl.split("/");
  if (parts.length < 3) {
    return { data: new ArrayBuffer(0) };
  }

  const z = parseInt(parts[0], 10);
  const x = parseInt(parts[1], 10);
  const y = parseInt(parts[2], 10);

  try {
    const tileData: number[] | null = await invoke("get_dem_tile", { z, x, y });
    if (tileData && tileData.length > 0) {
      const buffer = new Uint8Array(tileData).buffer;
      return { data: buffer };
    }
  } catch (err) {
    console.warn("DEM tile fetch notice:", err);
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
      name: "Mensa 3D & 2D Tactical Engine",
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        openmaptiles: {
          type: "vector",
          tiles: ["mbtiles://{z}/{x}/{y}"],
          minzoom: 0,
          maxzoom: 14
        },
        terrain_dem: {
          type: "raster-dem",
          tiles: ["dem://{z}/{x}/{y}"],
          tileSize: 256,
          encoding: "terrarium",
          maxzoom: 10
        }
      },
      layers: [
        {
          id: "background",
          type: "background",
          paint: { "background-color": "#090d16" }
        },
        {
          id: "landcover",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "landcover",
          paint: { "fill-color": "#052e16", "fill-opacity": 0.5 }
        },
        {
          id: "landuse",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "landuse",
          paint: { "fill-color": "#0f172a", "fill-opacity": 0.8 }
        },
        {
          id: "park",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "park",
          paint: { "fill-color": "#064e3b", "fill-opacity": 0.6 }
        },
        {
          id: "water",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "water",
          paint: { "fill-color": "#0a2540", "fill-opacity": 1.0 }
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
        // 3D Mountain Terrain Hillshade Relief Layer
        {
          id: "hillshade",
          type: "line",
          source: "openmaptiles",
          "source-layer": "waterway",
          layout: { "visibility": "none" },
          paint: {
            "line-color": "#4ade80",
            "line-width": 1.5,
            "line-dasharray": [2, 2]
          }
        },
        // 2D Building Fill Layer
        {
          id: "building_2d",
          type: "fill",
          source: "openmaptiles",
          "source-layer": "building",
          layout: { "visibility": "visible" },
          paint: {
            "fill-color": "#1e293b",
            "fill-outline-color": "#334155",
            "fill-opacity": 0.85
          }
        },
        // 3D Building Extrusion Layer
        {
          id: "building_3d",
          type: "fill-extrusion",
          source: "openmaptiles",
          "source-layer": "building",
          minzoom: 12,
          layout: { "visibility": "none" },
          paint: {
            "fill-extrusion-color": "#1e293b",
            "fill-extrusion-height": [
              "interpolate",
              ["linear"],
              ["zoom"],
              12, 0,
              13, ["coalesce", ["get", "render_height"], ["get", "height"], 20]
            ],
            "fill-extrusion-base": [
              "interpolate",
              ["linear"],
              ["zoom"],
              12, 0,
              13, ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0]
            ],
            "fill-extrusion-opacity": 0.9
          }
        },
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
    minZoom: 4.0,
    maxZoom: 20,
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
