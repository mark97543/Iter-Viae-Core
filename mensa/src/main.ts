import * as maplibregl from "maplibre-gl";
import * as turf from "@turf/turf";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save, open } from '@tauri-apps/plugin-dialog';
import flatpickr from "flatpickr";
import "flatpickr/dist/flatpickr.min.css";
import "flatpickr/dist/themes/dark.css";
function createFuelIconImageData(): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    const p = new Path2D("M6 4C4.895 4 4 4.895 4 6v20c0 1.105.895 2 2 2h10c1.105 0 2-.895 2-2V6c0-1.105-.895-2-2-2H6zm2 3h6v5H8V7zm-2 7h10v12H6V14zm14-5v3h1a1 1 0 0 1 1 1v6a2 2 0 0 0 2 2h.5a1.5 1.5 0 0 0 1.5-1.5V13.83a2 2 0 0 0-.586-1.414l-2.5-2.5A2 2 0 0 0 21.5 9.34V9.001c0-.553-.448-1-1-1H20z");
    ctx.fill(p);
    return ctx.getImageData(0, 0, 32, 32);
  }
  return new ImageData(32, 32);
}

function applyTheme(map: maplibregl.Map, themeId: string) {
  if (themeId === "3d-buildings") {
    // 1. 3D Buildings Mode (Camera pitch 60°, hardware extruded building blocks)
    map.setTerrain(null);
    map.easeTo({ pitch: 60, bearing: -17.6, duration: 1200 });

    if (map.getLayer("building_2d")) map.setLayoutProperty("building_2d", "visibility", "none");
    if (map.getLayer("building_3d")) map.setLayoutProperty("building_3d", "visibility", "visible");
    if (map.getLayer("terrain_hillshade")) map.setLayoutProperty("terrain_hillshade", "visibility", "none");

    if (map.getLayer("background")) map.setPaintProperty("background", "background-color", "#0b0f19");
    if (map.getLayer("landcover")) map.setPaintProperty("landcover", "fill-color", "#062c20");
    if (map.getLayer("landuse")) map.setPaintProperty("landuse", "fill-color", "#111827");
    if (map.getLayer("water")) map.setPaintProperty("water", "fill-color", "#061838");
    if (map.getLayer("boundary")) map.setPaintProperty("boundary", "line-color", "#38bdf8");
    if (map.getLayer("transportation_primary")) map.setPaintProperty("transportation_primary", "line-color", "#38bdf8");
    if (map.getLayer("transportation_motorway")) map.setPaintProperty("transportation_motorway", "line-color", "#f59e0b");
  } else if (themeId === "3d-terrain") {
    // 2. 3D Mountain Terrain Mode (Camera pitch 45°, true 1:1 natural real-world scale elevation)
    map.setTerrain({ source: "terrain_dem", exaggeration: 1.0 });
    map.easeTo({ pitch: 45, bearing: -15, duration: 1400 });

    if (map.getLayer("building_2d")) map.setLayoutProperty("building_2d", "visibility", "visible");
    if (map.getLayer("building_3d")) map.setLayoutProperty("building_3d", "visibility", "none");
    if (map.getLayer("terrain_hillshade")) map.setLayoutProperty("terrain_hillshade", "visibility", "visible");

    if (map.getLayer("background")) map.setPaintProperty("background", "background-color", "#0d1b1e");
    if (map.getLayer("landcover")) map.setPaintProperty("landcover", "fill-color", "#153a2a");
    if (map.getLayer("landuse")) map.setPaintProperty("landuse", "fill-color", "#1b2a26");
    if (map.getLayer("water")) map.setPaintProperty("water", "fill-color", "#0284c7");
    if (map.getLayer("boundary")) map.setPaintProperty("boundary", "line-color", "#fbbf24");
    if (map.getLayer("transportation_primary")) map.setPaintProperty("transportation_primary", "line-color", "#38bdf8");
    if (map.getLayer("transportation_motorway")) map.setPaintProperty("transportation_motorway", "line-color", "#f59e0b");
  } else {
    // 3. 2D Basic Tactical Mode (Default flat 2D top-down view)
    map.setTerrain(null);
    map.easeTo({ pitch: 0, bearing: 0, duration: 1200 });

    if (map.getLayer("building_2d")) map.setLayoutProperty("building_2d", "visibility", "visible");
    if (map.getLayer("building_3d")) map.setLayoutProperty("building_3d", "visibility", "none");
    if (map.getLayer("terrain_hillshade")) map.setLayoutProperty("terrain_hillshade", "visibility", "none");

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
          maxzoom: 16
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
        // Real WebGL Hillshade Shading Layer for 3D Mountain Terrain
        {
          id: "terrain_hillshade",
          type: "hillshade",
          source: "terrain_dem",
          layout: { "visibility": "none" },
          paint: {
            "hillshade-exaggeration": 0.85,
            "hillshade-shadow-color": "#050b14",
            "hillshade-highlight-color": "#ffffff",
            "hillshade-accent-color": "#0284c7",
            "hillshade-illumination-direction": 315
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
          minzoom: 11,
          paint: {
            "line-color": "#1e293b",
            "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.5, 14, 2]
          }
        },
        {
          id: "transportation_secondary",
          type: "line",
          source: "openmaptiles",
          "source-layer": "transportation",
          filter: ["in", "class", "secondary", "tertiary"],
          minzoom: 8,
          paint: {
            "line-color": "#64748b",
            "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 14, 3]
          }
        },
        {
          id: "transportation_primary",
          type: "line",
          source: "openmaptiles",
          "source-layer": "transportation",
          filter: ["in", "class", "primary"],
          minzoom: 6,
          paint: {
            "line-color": "#38bdf8",
            "line-width": ["interpolate", ["linear"], ["zoom"], 6, 1.0, 14, 4]
          }
        },
        {
          id: "transportation_motorway",
          type: "line",
          source: "openmaptiles",
          "source-layer": "transportation",
          filter: ["in", "class", "motorway", "trunk", "expressway"],
          minzoom: 4,
          paint: {
            "line-color": "#f59e0b",
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.2, 14, 5]
          }
        },
        // State & Province Labels
        {
          id: "place_label_state",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "place",
          filter: ["in", "class", "state", "province"],
          minzoom: 3,
          maxzoom: 12,
          layout: {
            "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"], ["get", "name:en"], ["get", "name_en"]],
            "text-font": ["Open Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 3, 11, 8, 17],
            "text-transform": "uppercase",
            "text-letter-spacing": 0.15,
            "text-max-width": 8
          },
          paint: {
            "text-color": "#94a3b8",
            "text-halo-color": "#090d16",
            "text-halo-width": 2.5,
            "text-opacity": 0.9
          }
        },
        // City Labels
        {
          id: "place_label_city",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "place",
          filter: ["==", "class", "city"],
          minzoom: 3,
          maxzoom: 18,
          layout: {
            "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"], ["get", "name:en"], ["get", "name_en"]],
            "text-font": ["Open Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 3, 10, 12, 19],
            "text-transform": "uppercase",
            "text-max-width": 10
          },
          paint: {
            "text-color": "#f8fafc",
            "text-halo-color": "#090d16",
            "text-halo-width": 2
          }
        },
        // Town & Village Labels
        {
          id: "place_label_town",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "place",
          filter: ["in", "class", "town", "village", "hamlet"],
          minzoom: 6,
          maxzoom: 18,
          layout: {
            "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"], ["get", "name:en"], ["get", "name_en"]],
            "text-font": ["Open Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 6, 10, 14, 15],
            "text-max-width": 9
          },
          paint: {
            "text-color": "#cbd5e1",
            "text-halo-color": "#090d16",
            "text-halo-width": 1.5
          }
        },
        // Suburb & Neighborhood Labels
        {
          id: "place_label_suburb",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "place",
          filter: ["in", "class", "suburb", "neighbourhood", "quarter", "locality", "island"],
          minzoom: 10,
          maxzoom: 18,
          layout: {
            "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"], ["get", "name:en"], ["get", "name_en"]],
            "text-font": ["Open Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 15, 13],
            "text-transform": "uppercase",
            "text-letter-spacing": 0.08
          },
          paint: {
            "text-color": "#94a3b8",
            "text-halo-color": "#090d16",
            "text-halo-width": 1.5
          }
        },
        // Country & Continent Labels
        {
          id: "place_label_other",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "place",
          filter: ["in", "class", "country", "continent"],
          minzoom: 1,
          maxzoom: 6,
          layout: {
            "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"], ["get", "name:en"], ["get", "name_en"]],
            "text-font": ["Open Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 1, 12, 6, 18],
            "text-transform": "uppercase",
            "text-letter-spacing": 0.2,
            "text-max-width": 10
          },
          paint: {
            "text-color": "#64748b",
            "text-halo-color": "#090d16",
            "text-halo-width": 2.5
          }
        },
        // Highway / Motorway Road Names
        {
          id: "road_label_motorway",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "transportation_name",
          filter: ["in", "class", "motorway", "trunk"],
          minzoom: 6,
          layout: {
            "symbol-placement": "line",
            "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"], ["get", "name:en"], ["get", "ref"]],
            "text-font": ["Open Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 6, 9, 14, 14],
            "text-max-angle": 30
          },
          paint: {
            "text-color": "#fbbf24",
            "text-halo-color": "#090d16",
            "text-halo-width": 2
          }
        },
        // Primary & Secondary Road Names
        {
          id: "road_label_primary",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "transportation_name",
          filter: ["in", "class", "primary", "secondary", "tertiary"],
          minzoom: 8,
          layout: {
            "symbol-placement": "line",
            "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"], ["get", "name:en"], ["get", "ref"]],
            "text-font": ["Open Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 8, 9, 14, 13],
            "text-max-angle": 30
          },
          paint: {
            "text-color": "#e2e8f0",
            "text-halo-color": "#090d16",
            "text-halo-width": 2
          }
        },
        // Minor & Residential Street Names
        {
          id: "road_label_minor",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "transportation_name",
          filter: ["in", "class", "minor", "service", "track", "residential", "unclassified"],
          minzoom: 11,
          layout: {
            "symbol-placement": "line",
            "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"], ["get", "name:en"], ["get", "ref"]],
            "text-font": ["Open Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 11, 9, 15, 12],
            "text-max-angle": 30
          },
          paint: {
            "text-color": "#cbd5e1",
            "text-halo-color": "#090d16",
            "text-halo-width": 1.5
          }
        },
        // Route Shields / Ref Numbers (I-95, US 101, etc.)
        {
          id: "road_label_ref",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "transportation_name",
          filter: ["has", "ref"],
          minzoom: 6,
          layout: {
            "symbol-placement": "line",
            "text-field": ["get", "ref"],
            "text-font": ["Open Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 6, 9, 14, 12],
            "text-max-angle": 30
          },
        },
        // --- Points of Interest (POIs) ---
        // Gas Stations / Fuel (Matches class="fuel", subclass="fuel", or amenity="fuel")
        {
          id: "poi_fuel",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "poi",
          filter: [
            "any",
            ["in", "class", "fuel", "gas_station"],
            ["in", "subclass", "fuel", "gas_station"],
            ["==", "amenity", "fuel"]
          ],
          minzoom: 10,
          layout: {
            "icon-image": "icon-fuel",
            "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.65, 16, 1.0],
            "icon-anchor": "bottom",
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
            "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"], ["get", "brand"], ["get", "name:en"], ["get", "subclass"]],
            "text-font": ["Open Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 16, 12],
            "text-transform": "uppercase",
            "text-max-width": 9,
            "text-offset": [0, 0.5],
            "text-anchor": "top",
            "text-optional": true
          },
          paint: {
            "icon-color": "#f59e0b",
            "icon-halo-color": "#090d16",
            "icon-halo-width": 2,
            "text-color": "#f59e0b",
            "text-halo-color": "#090d16",
            "text-halo-width": 2
          }
        },
        // Campgrounds & Outdoor Sites
        {
          id: "poi_campsite",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "poi",
          filter: [
            "any",
            ["in", "class", "campsite", "camp_site", "caravan_site"],
            ["in", "subclass", "campsite", "camp_site", "caravan_site", "alpine_hut"]
          ],
          minzoom: 10,
          layout: {
            "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"], ["get", "name:en"], ["get", "subclass"]],
            "text-font": ["Open Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 10, 10, 16, 13],
            "text-transform": "uppercase",
            "text-max-width": 9
          },
          paint: {
            "text-color": "#10b981",
            "text-halo-color": "#090d16",
            "text-halo-width": 2
          }
        },
        // Medical & Hospitals
        {
          id: "poi_hospital",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "poi",
          filter: [
            "any",
            ["in", "class", "hospital", "pharmacy", "clinic"],
            ["in", "subclass", "hospital", "pharmacy", "clinic", "doctors"]
          ],
          minzoom: 11,
          layout: {
            "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"], ["get", "name:en"], ["get", "subclass"]],
            "text-font": ["Open Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 16, 13],
            "text-transform": "uppercase",
            "text-max-width": 9
          },
          paint: {
            "text-color": "#ef4444",
            "text-halo-color": "#090d16",
            "text-halo-width": 2
          }
        },
        // Hotels, Motels & Lodging
        {
          id: "poi_lodging",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "poi",
          filter: [
            "any",
            ["in", "class", "lodging", "hotel", "motel"],
            ["in", "subclass", "hotel", "motel", "hostel", "guest_house", "lodging", "bed_and_breakfast", "chalet"]
          ],
          minzoom: 12,
          layout: {
            "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"], ["get", "name:en"], ["get", "subclass"]],
            "text-font": ["Open Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 12],
            "text-max-width": 9
          },
          paint: {
            "text-color": "#a855f7",
            "text-halo-color": "#090d16",
            "text-halo-width": 2
          }
        },
        // Restaurants, Cafes & Dining
        {
          id: "poi_restaurant",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "poi",
          filter: [
            "any",
            ["in", "class", "restaurant", "fast_food", "cafe", "food", "bar", "pub", "beer"],
            ["in", "subclass", "restaurant", "fast_food", "cafe", "food", "bar", "pub", "beer", "biergarten", "food_court", "bakery"]
          ],
          minzoom: 12,
          layout: {
            "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"], ["get", "brand"], ["get", "name:en"], ["get", "subclass"]],
            "text-font": ["Open Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 12],
            "text-max-width": 9
          },
          paint: {
            "text-color": "#f43f5e",
            "text-halo-color": "#090d16",
            "text-halo-width": 2
          }
        },
        // Stores, Supermarkets & Convenience
        {
          id: "poi_store",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "poi",
          filter: [
            "any",
            ["in", "class", "grocery", "shop", "supermarket", "convenience"],
            ["in", "subclass", "supermarket", "convenience", "deli", "delicatessen", "department_store", "grocery", "mall", "kiosk", "general"]
          ],
          minzoom: 12,
          layout: {
            "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"], ["get", "brand"], ["get", "name:en"], ["get", "subclass"]],
            "text-font": ["Open Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 12, 10, 16, 12],
            "text-max-width": 9
          },
          paint: {
            "text-color": "#06b6d4",
            "text-halo-color": "#090d16",
            "text-halo-width": 2
          }
        },
        // General POIs (Banks, Post, Police, Parks, Attractions)
        {
          id: "poi_general",
          type: "symbol",
          source: "openmaptiles",
          "source-layer": "poi",
          filter: [
            "any",
            ["in", "class", "bank", "police", "post", "town_hall", "library", "school", "college", "park", "attraction", "cemetery", "stadium"],
            ["in", "subclass", "bank", "police", "post_office", "townhall", "library", "school", "university", "park", "attraction", "cemetery"]
          ],
          minzoom: 13,
          layout: {
            "text-field": ["coalesce", ["get", "name:latin"], ["get", "name"], ["get", "name:en"], ["get", "subclass"]],
            "text-font": ["Open Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 16, 12],
            "text-max-width": 9
          },
          paint: {
            "text-color": "#94a3b8",
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
  map.on("load", () => {
    updateZoomDisplay();
    if (!map.hasImage("icon-fuel")) {
      map.addImage("icon-fuel", createFuelIconImageData(), { sdf: true });
    }
    applyTheme(map, "2d-basic");
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

  // ── POI Data Panel ────────────────────────────────────────

  // Category appearance config
  const POI_CATEGORY_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string; border: string }> = {
    poi_fuel:       { label: 'Fuel',       icon: '⛽', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)' },
    poi_campsite:   { label: 'Campsite',   icon: '⛺', color: '#10b981', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.35)'  },
    poi_hospital:   { label: 'Medical',    icon: '➕', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)'   },
    poi_lodging:    { label: 'Lodging',    icon: '🏨', color: '#a855f7', bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.35)'  },
    poi_restaurant: { label: 'Dining',     icon: '🍽️', color: '#f43f5e', bg: 'rgba(244,63,94,0.12)',   border: 'rgba(244,63,94,0.35)'   },
    poi_store:      { label: 'Store',      icon: '🛒', color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',   border: 'rgba(6,182,212,0.35)'   },
    poi_general:    { label: 'POI',        icon: '📍', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.3)'  },
  };

  const panel     = document.getElementById('poi-panel')!;
  const panelName = document.getElementById('poi-panel-name')!;
  const panelBadge= document.getElementById('poi-category-badge')!;
  const panelBody = document.getElementById('poi-panel-body')!;
  const coordLat  = document.getElementById('poi-coord-lat')!;
  const coordLng  = document.getElementById('poi-coord-lng')!;
  const closeBtn  = document.getElementById('poi-panel-close')!;

  let searchMarker: maplibregl.Marker | null = null;

  closeBtn.addEventListener('click', () => {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    if (searchMarker) {
      searchMarker.remove();
      searchMarker = null;
    }
  });
  // ── Row builders ──────────────────────────────────────────────────────────

  /** Plain labelled row — only call when value is non-empty */
  function makeRow(key: string, value: string): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'poi-row';
    row.innerHTML =
      `<span class="poi-row-key">${key}</span>` +
      `<span class="poi-row-val">${value}</span>`;
    return row;
  }

  /** Coordinates row: lat + lng on one line with a one-click copy button */
  function makeCoordRow(lat: number, lng: number): HTMLDivElement {
    const coordStr = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    const row = document.createElement('div');
    row.className = 'poi-row poi-row--coords';
    row.innerHTML =
      `<span class="poi-row-key">Coords</span>` +
      `<span class="poi-row-val poi-coord-val">${coordStr}</span>` +
      `<button class="poi-copy-btn" title="Copy coordinates" aria-label="Copy coordinates">⎘</button>`;
    const copyBtn = row.querySelector<HTMLButtonElement>('.poi-copy-btn')!;
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(coordStr).then(() => {
        copyBtn.textContent = '✓';
        copyBtn.classList.add('copied');
        setTimeout(() => { copyBtn.textContent = '⎘'; copyBtn.classList.remove('copied'); }, 2000);
      });
    });
    return row;
  }

  // ── Panel open / close ────────────────────────────────────────────────────

  function closePanel(): void {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  }

  // ── POI info type from Rust ───────────────────────────────────────────────

  interface GeocoderResult {
    name?:     string | null;
    category?: string | null;
    poi_type?: string | null;
    address?:  string | null;
    lat?:      number | null;
    lon?:      number | null;
    details?:  string | null;   // raw JSON blob
  }

  // ── Curated fields from the details JSON blob ─────────────────────────────
  // Each entry: [json_key, display_label, optional value formatter]
  type FieldDef = [string, string, ((v: string) => string)?];

  const DETAIL_FIELDS: FieldDef[] = [
    // Brand / Operator
    ['brand',                   'Brand'],
    ['operator',                'Operator'],
    ['network',                 'Network'],
    // Contact
    ['phone',                   'Phone'],
    ['website',                 'Website'],
    ['opening_hours',           'Hours'],
    // Address supplements
    ['addr:street',             'Street'],
    ['addr:housenumber',        'Number'],
    ['addr:city',               'City'],
    ['addr:postcode',           'Postcode'],
    ['addr:state',              'State'],
    // Food
    ['cuisine',                 'Cuisine',     (v) => v.replace(/;/g, ' · ')],
    // Fuel station extras
    ['fuel:diesel',             'Diesel',      (v) => v === 'yes' ? '✓ Available' : v],
    ['fuel:octane_87',          'Octane 87',   (v) => v === 'yes' ? '✓ Available' : v],
    ['fuel:octane_91',          'Octane 91',   (v) => v === 'yes' ? '✓ Available' : v],
    ['fuel:octane_93',          'Octane 93',   (v) => v === 'yes' ? '✓ Available' : v],
    ['compressed_air',          'Air',         (v) => v === 'yes' ? '✓ Available' : v],
    ['self_service',            'Self-Service', (v) => v === 'yes' ? '✓ Yes' : '✗ No'],
    // Hospital / Medical
    ['healthcare',              'Healthcare'],
    ['healthcare:speciality',   'Specialty'],
    ['emergency',               'Emergency',   (v) => v === 'yes' ? '✓ Yes' : v === 'no' ? '✗ No' : v],
    ['beds',                    'Beds'],
    // Place of worship
    ['religion',                'Religion',    (v) => v.charAt(0).toUpperCase() + v.slice(1)],
    ['denomination',            'Denomination',(v) => v.charAt(0).toUpperCase() + v.slice(1)],
    // Transit
    ['railway',                 'Rail Type'],
    ['public_transport',        'Transit'],
    ['subway',                  'Subway',      (v) => v === 'yes' ? '✓ Yes' : v],
    // Accessibility / payments
    ['wheelchair',              'Wheelchair',  (v) => v === 'yes' ? '✓ Accessible' : v === 'no' ? '✗ Not accessible' : v],
    ['payment:cash',            'Cash',        (v) => v === 'yes' ? '✓ Accepted' : '✗ No'],
    ['payment:credit_cards',    'Cards',       (v) => v === 'yes' ? '✓ Accepted' : '✗ No'],
    // General info
    ['ref',                     'Ref'],
    ['ele',                     'Elevation',   (v) => `${v} m`],
    ['population',              'Population',  (v) => Number(v).toLocaleString()],
    ['wikidata',                'Wikidata'],
    ['wikipedia',               'Wikipedia'],
  ];

  // ── Show panel (async — queries geocoder.db first) ────────────────────────

  function showPoiPanel(
    layerId: string,
    tileProps: Record<string, unknown>,
    lngLat: maplibregl.LngLat
  ): void {
    const cfg = POI_CATEGORY_CONFIG[layerId] ?? POI_CATEGORY_CONFIG.poi_general;

    const initialName = (tileProps['name:latin'] ?? tileProps['name:en'] ?? tileProps['name']
      ?? tileProps['brand'] ?? tileProps['subclass'] ?? tileProps['class'] ?? cfg.label ?? 'POI') as string;

    // Render immediately with vector tile properties so user can interact or Add to Trip with 0ms delay
    panelBadge.textContent      = `${cfg.icon}  ${cfg.label}`;
    panelBadge.style.color      = cfg.color;
    panelBadge.style.background = cfg.bg;
    panelBadge.style.border     = `1px solid ${cfg.border}`;
    panelName.textContent       = String(initialName);
    coordLat.textContent        = `φ ${lngLat.lat.toFixed(6)}°`;
    coordLng.textContent        = `λ ${lngLat.lng.toFixed(6)}°`;
    panelBody.innerHTML         = '';
    panelBody.appendChild(makeCoordRow(lngLat.lat, lngLat.lng));
    panel.setAttribute('aria-hidden', 'false');
    panel.classList.add('open');

    // Fetch extra offline geocoder metadata asynchronously in background without blocking UI
    invoke<GeocoderResult | null>('get_poi_info', {
      lat: lngLat.lat,
      lon: lngLat.lng,
    }).then(db => {
      if (!db || !panel.classList.contains('open')) return;

      if (db.name) panelName.textContent = String(db.name);

      const finalLat = db.lat ?? lngLat.lat;
      const finalLng = db.lon ?? lngLat.lng;
      coordLat.textContent = `φ ${finalLat.toFixed(6)}°`;
      coordLng.textContent = `λ ${finalLng.toFixed(6)}°`;

      panelBody.innerHTML = '';

      const address = (db.address && db.address.trim()) ? db.address.trim() : null;
      if (address) {
        panelBody.appendChild(makeRow('Address', address));
      }

      panelBody.appendChild(makeCoordRow(finalLat, finalLng));

      let extra: Record<string, string> = {};
      if (db.details) {
        try { extra = JSON.parse(db.details) as Record<string, string>; } catch (_) {}
      }

      const seenKeys = new Set<string>();
      for (const [key, label, fmt] of DETAIL_FIELDS) {
        if (seenKeys.has(key)) continue;
        const raw = extra[key];
        if (raw === undefined || raw === null || String(raw).trim() === '') continue;
        const display = fmt ? fmt(String(raw).trim()) : String(raw).trim();
        panelBody.appendChild(makeRow(label, display));
        seenKeys.add(key);
      }
    }).catch(() => {});
  }


  // ── Wire up close + click-away ────────────────────────────────────────────

  closeBtn.addEventListener('click', closePanel);

  map.on('click', (e) => {
    const hit = map.queryRenderedFeatures(e.point, { layers: Object.keys(POI_CATEGORY_CONFIG) });
    if (hit.length === 0) closePanel();
  });

  // ── Register click + cursor for every POI layer ───────────────────────────

  for (const layerId of Object.keys(POI_CATEGORY_CONFIG)) {
    map.on('click', layerId, (e) => {
      e.preventDefault();
      const feature = e.features?.[0];
      if (!feature) return;
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      void showPoiPanel(layerId, props, e.lngLat);
    });

  }

  // ── Trip Waypoint & Routing Logic ─────────────────────────────────────────

  interface Waypoint {
    id: string;
    lat: number;
    lng: number;
    name: string;
    type: string;
    stayDurationMinutes: number;
    isOvernight: boolean;
    overnightDepartureTime: string;
    budget: number;
    notes: string;
    timeOffsetSeconds?: number;
    calculatedArrivalString?: string;
    calculatedDepartureString?: string;
  }

  function getWaypointColor(type: string): string {
    switch (type) {
      case 'Start': return '#10b981';
      case 'End': return '#ef4444';
      case 'Shaping': return '#94a3b8';
      case 'Gas': return '#f59e0b';
      case 'Food': return '#8b5cf6';
      case 'Attraction': return '#ec4899';
      case 'Lodging': return '#3b82f6';
      case 'Waypoint':
      default: return '#38bdf8';
    }
  }

  let tripWaypoints: Waypoint[] = [];
  let routeMarkers: maplibregl.Marker[] = [];
  let isDraggingWp = false;
  let draggedWpIndex: number | null = null;
  let currentRouteLineCoords: number[][] = [];

  const tripListEl = document.getElementById("trip-waypoint-list")!;
  const distEl = document.getElementById("trip-dist-val")!;
  const timeEl = document.getElementById("trip-time-val")!;
  const poiAddBtn = document.getElementById("poi-add-to-trip")!;

  // Map Context Menu Elements
  const ctxMenu = document.getElementById("map-context-menu")!;
  const ctxAddWpBtn = document.getElementById("ctx-add-wp")!;
  let ctxLngLat: maplibregl.LngLat | null = null;
  
  // ── Global Trip State ──────────────────────────────────────────
  let tripTitle = "My Tactical Operation";
  let tripHasSpecificDate = true;
  let tripStartTime = new Date();
  let tripNotes = "";

  // ── Trip Summary Modal Setup ────────────────────────────────────────
  const tripTitleDisplay = document.getElementById("trip-title-display")!;
  const summaryModal = document.getElementById("trip-summary-modal")!;
  const summaryCloseBtn = document.getElementById("summary-close-btn")!;
  const summarySaveBtn = document.getElementById("summary-save-btn")!;
  
  const sTitle = document.getElementById("summary-trip-title") as HTMLInputElement;
  const sHasDate = document.getElementById("summary-has-date") as HTMLInputElement;
  const sDateFields = document.getElementById("summary-date-fields")!;
  const sStartTimeInput = document.getElementById("summary-start-time") as HTMLInputElement;
  const sNotes = document.getElementById("summary-trip-notes") as HTMLTextAreaElement;

  const sTotWp = document.getElementById("summary-tot-wp")!;
  const sStartPicker = flatpickr(sStartTimeInput, {
    enableTime: true,
    dateFormat: "Y-m-d H:i",
    defaultDate: tripStartTime
  });

  tripTitleDisplay.addEventListener("click", () => {
    sTitle.value = tripTitle;
    sHasDate.checked = tripHasSpecificDate;
    sDateFields.style.display = tripHasSpecificDate ? "block" : "none";
    sStartPicker.setDate(tripStartTime);
    sNotes.value = tripNotes;
    
    sTotWp.textContent = tripWaypoints.length.toString();
    summaryModal.style.display = "flex";
  });

  sHasDate.addEventListener("change", () => {
    sDateFields.style.display = sHasDate.checked ? "block" : "none";
  });

  summaryCloseBtn.addEventListener("click", () => {
    summaryModal.style.display = "none";
  });

  summarySaveBtn.addEventListener("click", () => {
    tripTitle = sTitle.value || "My Tactical Operation";
    tripTitleDisplay.textContent = tripTitle;
    tripHasSpecificDate = sHasDate.checked;
    tripNotes = sNotes.value;
    
    if (sStartTimeInput.value) {
      tripStartTime = new Date(sStartTimeInput.value);
    }
    
    summaryModal.style.display = "none";
    renderWaypointList();
    updateMapRoute();
  });
  
  // Format dates cleanly for UI
  function formatTime(d: Date): string {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function formatDate(d: Date): string {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  let activeListDragIndex: number | null = null;

  // Render Waypoint List (UI)
  function renderWaypointList() {
    tripListEl.innerHTML = "";
    tripWaypoints.forEach((wp, index) => {
      const li = document.createElement("li");
      li.className = "wp-item";
      if (activeListDragIndex === index) {
        li.classList.add("dragging");
      }
      li.draggable = true;
      li.dataset.index = index.toString();
      
      li.innerHTML = `
        <div class="wp-drag-handle">≡</div>
        <div class="wp-details" style="flex: 1; display: flex; flex-direction: column; gap: 4px; border-left: 4px solid ${getWaypointColor(wp.type || 'Waypoint')}; padding-left: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="display: flex; flex-direction: column;">
              <span class="wp-name" title="Click to edit">${wp.name}</span>
              <span class="wp-type" style="font-size: 0.65rem; color: ${getWaypointColor(wp.type || 'Waypoint')}; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; margin-top: 2px;">${wp.type || 'Waypoint'}</span>
              <span class="wp-coords" style="font-size: 0.7rem; color: #94a3b8; font-family: monospace; margin-top: 2px;">φ ${wp.lat.toFixed(5)}°, λ ${wp.lng.toFixed(5)}°</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="wp-edit" title="Edit" style="background:transparent; border:none; color:#38bdf8; cursor:pointer; font-size:16px;">✎</button>
              <button class="wp-remove" title="Remove" style="background:transparent; border:none; color:#ef4444; cursor:pointer; font-size:16px;">&times;</button>
            </div>
          </div>
          <div class="wp-time-badges" id="wp-time-${index}" style="display: flex; gap: 6px; font-family: monospace; font-size: 0.7rem;">
            <span class="badge-arr" style="display: none; padding: 2px 6px; background: rgba(16, 185, 129, 0.2); color: #34d399; border-radius: 4px;">ARR: --:--</span>
            <span class="badge-dep" style="display: none; padding: 2px 6px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; border-radius: 4px;">DEP: --:--</span>
          </div>
        </div>
        <div class="leg-info" id="leg-info-${index}" style="display: none; width: 100%; font-size: 0.75rem; color: #94a3b8; text-align: center; padding-top: 6px; border-top: 1px dashed rgba(51, 65, 85, 0.8); margin-top: 4px; font-family: monospace;"></div>
      `;

      // Click to Zoom (moved to name so inputs are clickable)
      li.querySelector(".wp-name")!.addEventListener("click", () => {
        map.flyTo({ center: [wp.lng, wp.lat], zoom: 14 });
      });

      // Remove
      li.querySelector(".wp-remove")!.addEventListener("click", (e) => {
        e.stopPropagation();
        removeWaypoint(wp.id);
      });

      // Edit (Open Modal)
      li.querySelector(".wp-edit")!.addEventListener("click", (e) => {
        e.stopPropagation();
        openWaypointModal(wp.id);
      });

      // Live Dynamic Drag & Drop Logic
      li.addEventListener("dragstart", (e) => {
        activeListDragIndex = index;
        li.classList.add("dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", index.toString());
        }
      });

      li.addEventListener("dragend", () => {
        activeListDragIndex = null;
        renderWaypointList();
        updateMapRoute();
      });

      li.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = "move";
        }
        if (activeListDragIndex !== null && activeListDragIndex !== index) {
          const item = tripWaypoints.splice(activeListDragIndex, 1)[0];
          tripWaypoints.splice(index, 0, item);
          activeListDragIndex = index;
          renderWaypointList();
          updateMapWaypointMarkersOnly();
        }
      });

      li.addEventListener("drop", (e) => {
        e.preventDefault();
        activeListDragIndex = null;
        renderWaypointList();
        updateMapRoute();
      });

      tripListEl.appendChild(li);
    });
  }

  function addWaypoint(lat: number, lng: number, name: string, type?: string) {
    tripWaypoints.push({
      id: Math.random().toString(36).substring(2, 9),
      lat,
      lng,
      name,
      type: type || "Waypoint",
      stayDurationMinutes: 0,
      isOvernight: false,
      overnightDepartureTime: "08:00",
      budget: 0,
      notes: ""
    });
    renderWaypointList();
    updateMapRoute();
  }

  function removeWaypoint(id: string) {
    tripWaypoints = tripWaypoints.filter(w => w.id !== id);
    renderWaypointList();
    updateMapRoute();
  }



  // ── Waypoint Modal Logic ──────────────────────────────────────────

  const wpModal = document.getElementById("waypoint-modal")!;
  const wpModalClose = document.getElementById("modal-close-btn")!;
  const wpModalSave = document.getElementById("modal-save-btn")!;
  
  const mId = document.getElementById("modal-wp-id") as HTMLInputElement;
  const mName = document.getElementById("modal-wp-name") as HTMLInputElement;
  const mType = document.getElementById("modal-wp-type") as HTMLSelectElement;
  const mRadios = document.getElementsByName("modal-schedule-type") as NodeListOf<HTMLInputElement>;
  const mStopFields = document.getElementById("modal-stop-fields")!;
  const mOvernightFields = document.getElementById("modal-overnight-fields")!;
  const mStay = document.getElementById("modal-wp-stay") as HTMLInputElement;
  const mDepart = document.getElementById("modal-wp-depart") as HTMLInputElement;
  const mDepartPicker = flatpickr(mDepart, {
    enableTime: true,
    noCalendar: true,
    dateFormat: "H:i",
    time_24hr: false
  });
  const mBudget = document.getElementById("modal-wp-budget") as HTMLInputElement;
  const mNotes = document.getElementById("modal-wp-notes") as HTMLTextAreaElement;

  mRadios.forEach(r => {
    r.addEventListener("change", () => {
      if (r.value === "stop") {
        mStopFields.style.display = "block";
        mOvernightFields.style.display = "none";
      } else {
        mStopFields.style.display = "none";
        mOvernightFields.style.display = "block";
      }
    });
  });

  function openWaypointModal(id: string) {
    const wp = tripWaypoints.find(w => w.id === id);
    if (!wp) return;
    
    mId.value = wp.id;
    mName.value = wp.name;
    mType.value = wp.type || "Waypoint";
    mStay.value = wp.stayDurationMinutes.toString();
    mDepartPicker.setDate(wp.overnightDepartureTime);
    mBudget.value = wp.budget.toString();
    mNotes.value = wp.notes;
    
    if (wp.isOvernight) {
      mRadios[1].checked = true;
      mStopFields.style.display = "none";
      mOvernightFields.style.display = "block";
    } else {
      mRadios[0].checked = true;
      mStopFields.style.display = "block";
      mOvernightFields.style.display = "none";
    }
    
    wpModal.style.display = "flex";
  }

  wpModalClose.addEventListener("click", () => {
    wpModal.style.display = "none";
  });

  wpModalSave.addEventListener("click", () => {
    const id = mId.value;
    const wp = tripWaypoints.find(w => w.id === id);
    if (wp) {
      wp.name = mName.value;
      wp.type = mType.value;
      wp.isOvernight = mRadios[1].checked;
      wp.stayDurationMinutes = parseInt(mStay.value) || 0;
      wp.overnightDepartureTime = mDepart.value;
      wp.budget = parseFloat(mBudget.value) || 0;
      wp.notes = mNotes.value;
      
      renderWaypointList();
      updateMapRoute();
    }
    wpModal.style.display = "none";
  });

  // Update MapLibre Markers & Route
  function updateMapWaypointMarkersOnly() {
    routeMarkers.forEach(m => m.remove());
    routeMarkers = [];

    const waypointsGeoJson: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: tripWaypoints.map((wp, i) => ({
        type: "Feature",
        properties: {
          id: wp.id,
          name: wp.name,
          color: getWaypointColor(wp.type),
          index: i + 1
        },
        geometry: {
          type: "Point",
          coordinates: [wp.lng, wp.lat]
        }
      }))
    };

    const wpSource = map.getSource("trip-waypoints") as maplibregl.GeoJSONSource;
    if (wpSource) {
      wpSource.setData(waypointsGeoJson);
    } else {
      map.addSource("trip-waypoints", { type: "geojson", data: waypointsGeoJson });
      
      map.addLayer({
        id: "trip-waypoints-circle",
        type: "circle",
        source: "trip-waypoints",
        paint: {
          "circle-radius": 9,
          "circle-color": ["get", "color"],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff"
        }
      });

      map.addLayer({
        id: "trip-waypoints-text",
        type: "symbol",
        source: "trip-waypoints",
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Open Sans Regular"],
          "text-size": 12,
          "text-offset": [0, 1.2],
          "text-anchor": "top"
        },
        paint: {
          "text-color": "#f8fafc",
          "text-halo-color": "#090d16",
          "text-halo-width": 2
        }
      });

      // Interactive mouse drag handlers directly on the WebGL GPU canvas
      map.on('mouseenter', 'trip-waypoints-circle', () => {
        if (!isDraggingWp) map.getCanvas().style.cursor = 'grab';
      });

      map.on('mouseleave', 'trip-waypoints-circle', () => {
        if (!isDraggingWp) map.getCanvas().style.cursor = '';
      });

      map.on('mousedown', 'trip-waypoints-circle', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;

        e.preventDefault();
        isDraggingWp = true;
        draggedWpIndex = typeof feature.properties?.index === 'number' ? (feature.properties.index - 1) : null;
        map.getCanvas().style.cursor = 'grabbing';

        function onMove(me: maplibregl.MapMouseEvent) {
          if (!isDraggingWp || draggedWpIndex === null) return;
          const coords = me.lngLat;
          
          if (tripWaypoints[draggedWpIndex]) {
            tripWaypoints[draggedWpIndex].lat = coords.lat;
            tripWaypoints[draggedWpIndex].lng = coords.lng;

            updateMapWaypointMarkersOnly();
          }
        }

        function onUp() {
          if (!isDraggingWp) return;
          isDraggingWp = false;
          draggedWpIndex = null;
          map.getCanvas().style.cursor = '';

          map.off('mousemove', onMove);
          map.off('mouseup', onUp);

          renderWaypointList();
          updateMapRoute();
        }

        map.on('mousemove', onMove);
        map.on('mouseup', onUp);
      });
    }
  }

  let routeCalcDebounceTimer: any = null;

  function updateMapRoute(immediate = false) {
    updateMapWaypointMarkersOnly();

    if (routeCalcDebounceTimer) {
      clearTimeout(routeCalcDebounceTimer);
      routeCalcDebounceTimer = null;
    }

    if (immediate) {
      void performRouteCalculation();
    } else {
      routeCalcDebounceTimer = setTimeout(() => {
        void performRouteCalculation();
      }, 150);
    }
  }

  async function performRouteCalculation() {
    if (tripWaypoints.length < 2) {
      if (map.getSource("trip-route")) {
        (map.getSource("trip-route") as maplibregl.GeoJSONSource).setData({ type: "FeatureCollection", features: [] });
      }
      distEl.textContent = "0 mi";
      timeEl.textContent = "0 hrs";
      document.getElementById("trip-budget-val")!.textContent = "$0.00";
      currentRouteLineCoords = [];
      refreshFuelCorridorsIfActive();
      return;
    }

    // Call Valhalla via Tauri IPC
    try {
      const payload = tripWaypoints.map(w => ({ 
        lat: w.lat, 
        lon: w.lng,
        type: w.type === 'Shaping' ? 'through' : 'break'
      }));
      const result = await invoke<{ geojson: any, distance: number, time: number }>("calculate_route", { waypoints: payload });
      
      distEl.textContent = `${result.distance.toFixed(2)} mi`;
      const hrs = Math.floor(result.time / 3600);
      const mins = Math.floor((result.time % 3600) / 60);
      timeEl.textContent = hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;
      
      const totalBudget = tripWaypoints.reduce((acc, wp) => acc + (wp.budget || 0), 0);
      document.getElementById("trip-budget-val")!.textContent = `$${totalBudget.toFixed(2)}`;

      // Valhalla returns a polyline shape, we need to decode it.
      const legs = result.geojson?.trip?.legs;
      
      let lineCoords: number[][] = [];
      if (legs && legs.length > 0) {
        
        // --- Calculate Timeline ---
        let currentArrival = tripHasSpecificDate ? new Date(tripStartTime.getTime()) : new Date();
        let currentDeparture = new Date(currentArrival);

        // Clear existing day dividers
        document.querySelectorAll('.day-divider').forEach(el => el.remove());
        let dayCounter = 1;
        let lastDateString = "";

        tripWaypoints.forEach((wp, i) => {
          // Arrive at WP[i]
          if (i > 0) {
            const prevLegTime = legs[i - 1]?.summary?.time || 0;
            currentArrival = new Date(currentDeparture.getTime() + prevLegTime * 1000);
          } else {
            currentArrival = tripHasSpecificDate ? new Date(tripStartTime.getTime()) : new Date();
          }

          // Depart from WP[i]
          if (wp.isOvernight) {
            const dep = new Date(currentArrival);
            dep.setDate(dep.getDate() + 1); // Move to next day
            if (wp.overnightDepartureTime) {
              const [h, m] = wp.overnightDepartureTime.split(":");
              dep.setHours(parseInt(h), parseInt(m), 0, 0);
            }
            currentDeparture = dep;
          } else {
            currentDeparture = new Date(currentArrival.getTime() + (wp.stayDurationMinutes || 0) * 60000);
          }

          // Day Divider Logic
          const currDateStr = currentArrival.toDateString();
          if (i === 0 || currDateStr !== lastDateString) {
            lastDateString = currDateStr;
            if (i > 0) dayCounter++; // Increment before display on new days
            
            const li = tripListEl.querySelector(`li[data-index="${i}"]`);
            if (li) {
              const divider = document.createElement("div");
              divider.className = "day-divider";
              divider.textContent = tripHasSpecificDate 
                ? `Day ${dayCounter} - ${formatDate(currentArrival)}`
                : `Day ${dayCounter}`;
              tripListEl.insertBefore(divider, li);
            }
          }

          // Generate Print Strings
          if (tripHasSpecificDate) {
             wp.calculatedArrivalString = currentArrival.toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
             wp.calculatedDepartureString = currentDeparture.toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
          } else {
             wp.calculatedArrivalString = `Day ${dayCounter}, ${currentArrival.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
             let depDay = dayCounter;
             if (currentDeparture.getDate() !== currentArrival.getDate()) depDay++;
             wp.calculatedDepartureString = `Day ${depDay}, ${currentDeparture.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
          }

          // Update UI Badges
          const timeContainer = document.getElementById(`wp-time-${i}`);
          if (timeContainer) {
            const arrBadge = timeContainer.querySelector('.badge-arr') as HTMLElement;
            const depBadge = timeContainer.querySelector('.badge-dep') as HTMLElement;
            
            if (i > 0) {
              arrBadge.style.display = 'block';
              arrBadge.textContent = `ARR: ${formatTime(currentArrival)}`;
            } else {
              arrBadge.style.display = 'none';
            }

            if (i < tripWaypoints.length - 1) {
              depBadge.style.display = 'block';
              depBadge.textContent = `DEP: ${formatTime(currentDeparture)}`;
            } else {
              depBadge.style.display = 'none';
            }
          }
        });
        
        // Populate Modal Totals
        const sTotDist = document.getElementById("summary-tot-dist")!;
        const sTotTime = document.getElementById("summary-tot-time")!;
        const sTotBudget = document.getElementById("summary-tot-budget")!;
        const sEstEnd = document.getElementById("summary-est-end")!;

        sTotDist.textContent = `${result.distance.toFixed(2)} mi`;
        sTotTime.textContent = timeEl.textContent || "0 hrs";
        sTotBudget.textContent = `$${totalBudget.toFixed(2)}`;
        
        if (tripWaypoints.length > 0) {
          sEstEnd.textContent = tripHasSpecificDate
            ? `${formatDate(currentDeparture)} ${formatTime(currentDeparture)}`
            : `Day ${dayCounter} - ${formatTime(currentDeparture)}`;
        } else {
          sEstEnd.textContent = "--";
        }

        // Populate Distance & Time in Sidebar (Legs)
        legs.forEach((leg: any, i: number) => {
          const legInfo = document.getElementById(`leg-info-${i}`);
          if (legInfo && leg.summary) {
            const dist = leg.summary.length.toFixed(1);
            const t = leg.summary.time;
            const h = Math.floor(t / 3600);
            const m = Math.floor((t % 3600) / 60);
            const timeStr = h > 0 ? `${h}h ${m}m` : `${m} min`;
            legInfo.textContent = `↓  ${dist} mi • ${timeStr}  ↓`;
            legInfo.style.display = 'block';
          }
        });
        // Decode polyline6 for each leg
        for (const leg of legs) {
          const shape = leg.shape;
          if (!shape) continue;
          
          let index = 0, lat = 0, lng = 0;
          const factor = 1e6;
          while (index < shape.length) {
              let b, shift = 0, res = 0;
              do {
                  b = shape.charCodeAt(index++) - 63;
                  res |= (b & 0x1f) << shift;
                  shift += 5;
              } while (b >= 0x20);
              lat += ((res & 1) ? ~(res >> 1) : (res >> 1));

              shift = 0;
              res = 0;
              do {
                  b = shape.charCodeAt(index++) - 63;
                  res |= (b & 0x1f) << shift;
                  shift += 5;
              } while (b >= 0x20);
              lng += ((res & 1) ? ~(res >> 1) : (res >> 1));

              lineCoords.push([lng / factor, lat / factor]);
          }
        }
      } else {
        // Fallback
        lineCoords = tripWaypoints.map(w => [w.lng, w.lat]);
      }
      
      currentRouteLineCoords = lineCoords;
      
      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: lineCoords
          }
        }]
      };

      const source = map.getSource("trip-route") as maplibregl.GeoJSONSource;
      if (source) {
        source.setData(geojson);
      } else {
        map.addSource("trip-route", { type: "geojson", data: geojson });
        map.addLayer({
          id: "trip-route-layer",
          type: "line",
          source: "trip-route",
          layout: {
            "line-join": "round",
            "line-cap": "round"
          },
          paint: {
            "line-color": "#38bdf8",
            "line-width": 4,
            "line-dasharray": [2, 2]
          }
        });
      }
    } catch (e) {
      console.error("Valhalla Routing Error (Local Offline Service Unavailable):", e);
      // Fallback visual straight line if Valhalla fails (e.g., Faber routing map not built yet)
      const lineCoords = tripWaypoints.map(w => [w.lng, w.lat]);
      const geojson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: lineCoords }
        }]
      };
      const source = map.getSource("trip-route") as maplibregl.GeoJSONSource;
      if (source) {
        source.setData(geojson);
      } else {
        map.addSource("trip-route", { type: "geojson", data: geojson });
        map.addLayer({
          id: "trip-route-layer",
          type: "line",
          source: "trip-route",
          layout: { "line-join": "round", "line-cap": "round" },
          paint: { "line-color": "#ef4444", "line-width": 4, "line-dasharray": [2, 2] }
        });
      }
    }
    refreshFuelCorridorsIfActive();
  }

  // Map Context Menu
  map.on('contextmenu', (e) => {
    e.preventDefault();
    ctxLngLat = e.lngLat;
    ctxMenu.style.left = `${e.point.x}px`;
    ctxMenu.style.top = `${e.point.y}px`;
    ctxMenu.classList.remove('hidden');
  });

  map.on('click', () => {
    ctxMenu.classList.add('hidden');
  });

  ctxAddWpBtn.addEventListener('click', () => {
    if (ctxLngLat) {
      addWaypoint(ctxLngLat.lat, ctxLngLat.lng, "Custom Waypoint");
    }
    ctxMenu.classList.add('hidden');
  });

  // ── Coordinate Search UI ────────────────────────────────────────────────
  const searchInput = document.getElementById("coord-search-input") as HTMLInputElement | null;
  const searchBtn = document.getElementById("coord-search-btn") as HTMLButtonElement | null;

  function executeCoordinateSearch() {
    if (!searchInput || !searchInput.value.trim()) return;

    // Parse input (supports comma or space separation of numbers, lat/lng or lng/lat)
    const val = searchInput.value.replace(/[^\d.\-,\s]/g, '');
    const parts = val.split(/[,\s]+/).filter(p => p.length > 0);
    if (parts.length >= 2) {
      const v1 = parseFloat(parts[0]);
      const v2 = parseFloat(parts[1]);
      if (!isNaN(v1) && !isNaN(v2)) {
        let lat = v1;
        let lng = v2;
        if (Math.abs(v1) > 90 && Math.abs(v2) <= 90) {
          lng = v1;
          lat = v2;
        }

        // Fly to location
        map.flyTo({ center: [lng, lat], zoom: 12 });

        // Clear old search pin marker if any
        if (searchMarker) {
          searchMarker.remove();
          searchMarker = null;
        }

        // Render WebGL search pin (hardware-locked to GPU map canvas)
        const searchGeoJson: GeoJSON.FeatureCollection = {
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            properties: { name: `Search Result (${lat.toFixed(5)}, ${lng.toFixed(5)})` },
            geometry: { type: "Point", coordinates: [lng, lat] }
          }]
        };
        const searchSource = map.getSource("search-pin-source") as maplibregl.GeoJSONSource;
        if (searchSource) {
          searchSource.setData(searchGeoJson);
        } else {
          map.addSource("search-pin-source", { type: "geojson", data: searchGeoJson });
          map.addLayer({
            id: "search-pin-layer",
            type: "circle",
            source: "search-pin-source",
            paint: {
              "circle-radius": 10,
              "circle-color": "#ef4444",
              "circle-stroke-width": 3,
              "circle-stroke-color": "#ffffff"
            }
          });
        }

        // Show POI Panel
        panelBadge.textContent      = `📍  Coordinate Pin`;
        panelBadge.style.color      = '#cbd5e1';
        panelBadge.style.background = '#0f172a';
        panelBadge.style.border     = `1px solid #334155`;
        panelName.textContent       = `Search Result (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
        panelBody.innerHTML         = `
          <div class="poi-row">
            <span class="poi-label">LAT / LNG</span>
            <span class="poi-value">${lat.toFixed(5)}, ${lng.toFixed(5)}</span>
          </div>
        `;
        coordLat.textContent = `φ ${lat.toFixed(5)}°`;
        coordLng.textContent = `λ ${lng.toFixed(5)}°`;

        panel.setAttribute('aria-hidden', 'false');
        panel.classList.add('open');
      }
    }
  }

  if (searchBtn && searchInput) {
    searchBtn.addEventListener("click", executeCoordinateSearch);
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") executeCoordinateSearch();
    });
  }

  // Add to Trip from POI Panel
  poiAddBtn.addEventListener('click', () => {
    const latStr = coordLat.textContent?.replace('φ ', '').replace('°', '');
    const lngStr = coordLng.textContent?.replace('λ ', '').replace('°', '');
    const name = panelName.textContent || "Unknown POI";
    if (latStr && lngStr) {
      addWaypoint(parseFloat(latStr), parseFloat(lngStr), name);
    }
  });

  // ── File Persistence Logic ───────────────────────────────────────────────
  
  let currentFilePath: string | null = null;
  
  function serializeTrip() {
    return JSON.stringify({
      version: 1,
      tripTitle,
      tripStartTime,
      tripHasSpecificDate,
      tripNotes,
      tripWaypoints
    }, null, 2);
  }

  function deserializeTrip(data: string) {
    try {
      const parsed = JSON.parse(data);
      if (parsed.version === 1) {
        tripTitle = parsed.tripTitle || "My Tactical Operation";
        tripStartTime = parsed.tripStartTime ? new Date(parsed.tripStartTime) : new Date();
        tripHasSpecificDate = parsed.tripHasSpecificDate ?? true;
        tripNotes = parsed.tripNotes || "";
        tripWaypoints = parsed.tripWaypoints || [];
        
        tripTitleDisplay.textContent = tripTitle;
        renderWaypointList();
        updateMapRoute();
      }
    } catch (err) {
      console.error("Failed to load trip", err);
    }
  }

  async function getSaveDir() {
    try {
      return await invoke<string>("get_trips_dir");
    } catch (e) {
      console.warn("Could not get trips dir", e);
      return undefined;
    }
  }

  async function saveTripAs() {
    try {
      const defaultPath = await getSaveDir();
      let path = await save({
        defaultPath,
        filters: [{ name: 'Iter Viae Trip', extensions: ['viae', 'json'] }]
      });
      if (path) {
        if (!path.endsWith('.viae') && !path.endsWith('.json')) {
          path += '.viae';
        }
        currentFilePath = path;
        await invoke("save_trip_file", { path, data: serializeTrip() });
      }
    } catch (err) {
      console.error("Save As Failed", err);
    }
  }

  async function saveTrip() {
    try {
      if (currentFilePath) {
        await invoke("save_trip_file", { path: currentFilePath, data: serializeTrip() });
      } else {
        await saveTripAs();
      }
    } catch (err) {
      console.error("Save Failed", err);
    }
  }

  async function loadTrip() {
    try {
      const defaultPath = await getSaveDir();
      const path = await open({
        defaultPath,
        filters: [{ name: 'Iter Viae Trip', extensions: ['viae', 'json'] }]
      });
      if (path && typeof path === 'string') {
        const data = await invoke<string>("load_trip_file", { path });
        currentFilePath = path;
        deserializeTrip(data);
      }
    } catch (err) {
      console.error("Load Failed", err);
    }
  }

  function newTrip() {
    currentFilePath = null;
    tripTitle = "My Tactical Operation";
    tripStartTime = new Date();
    tripHasSpecificDate = true;
    tripNotes = "";
    tripWaypoints = [];
    
    tripTitleDisplay.textContent = tripTitle;
    renderWaypointList();
    clearFuelCorridors();
    updateMapRoute();
  }

  // ── Print Engine ────────────────────────────────────────────────────────
  const printModal = document.getElementById("print-modal");
  const printCancelBtn = document.getElementById("print-cancel-btn");
  const printConfirmBtn = document.getElementById("print-confirm-btn");
  const printSizeSelect = document.getElementById("print-size") as HTMLSelectElement;
  const printContainer = document.getElementById("print-container")!;
  const printPreviewContainer = document.getElementById("print-preview-container")!;

  function openPrintModal() {
    if (printModal) {
      updatePrintPreview();
      printModal.style.display = "flex";
    }
  }

  printSizeSelect?.addEventListener("change", () => {
    updatePrintPreview();
  });

  function updatePrintPreview() {
    printPreviewContainer.className = `print-core-styles`;
    printPreviewContainer.innerHTML = generatePrintLayoutHTML();
  }

  printCancelBtn?.addEventListener("click", () => {
    if (printModal) printModal.style.display = "none";
  });

  printConfirmBtn?.addEventListener("click", () => {
    if (printModal) printModal.style.display = "none";
    
    // Inject into actual print container
    printContainer.className = `print-core-styles`;
    printContainer.innerHTML = generatePrintLayoutHTML();

    // Tiny delay to ensure DOM is updated before print dialog triggers
    setTimeout(() => {
      window.print();
    }, 100);
  });

  function generatePrintLayoutHTML(): string {
    const size = printSizeSelect.value;
    
    // Chunking settings based on size
    let firstPageCapacity = 0;
    let subsequentPageCapacity = 0;
    
    if (size === 'letter') {
       firstPageCapacity = 7;
       subsequentPageCapacity = 9;
    } else if (size === 'a5') {
       firstPageCapacity = 3;
       subsequentPageCapacity = 5;
    } else if (size === 'field-notes') {
       firstPageCapacity = 1; // 1 under header
       subsequentPageCapacity = 2; // 2 per tiny page max
    }

    // Build Waypoint Cards
    const cards = tripWaypoints.map((wp, index) => {
      let arrTime = wp.calculatedArrivalString || "N/A";
      let depTime = wp.calculatedDepartureString || "N/A";
      
      let card = `<div class="print-wp-log">`;
      card += `<div class="print-wp-header">
                 <div class="print-wp-title">[${index + 1}] ${wp.name} ${wp.isOvernight ? '<span class="print-tag-overnight">OVERNIGHT</span>' : ''}</div>
                 <div class="print-wp-type">${wp.type || "WP"}</div>
               </div>`;
               
      if (size === 'field-notes') {
         // Dense vertical stacking for narrow widths
         card += `<div class="print-wp-row">
                    <div class="print-wp-cell"><div class="print-wp-label">Arr</div><div class="print-wp-val">${arrTime}</div></div>
                    <div class="print-wp-cell"><div class="print-wp-label">Dep</div><div class="print-wp-val">${depTime}</div></div>
                  </div>`;
         card += `<div class="print-wp-row">
                    <div class="print-wp-cell"><div class="print-wp-label">Lat / Lng</div><div class="print-wp-val">${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}</div></div>
                  </div>`;
         card += `<div class="print-wp-row">
                    <div class="print-wp-cell"><div class="print-wp-label">Stay</div><div class="print-wp-val">${wp.stayDurationMinutes || 0}m</div></div>
                    <div class="print-wp-cell"><div class="print-wp-label">Budget</div><div class="print-wp-val">$${wp.budget || 0}</div></div>
                  </div>`;
      } else {
         // Wider horizontal layout for A5 and Letter
         card += `<div class="print-wp-row">
                    <div class="print-wp-cell"><div class="print-wp-label">Arr</div><div class="print-wp-val">${arrTime}</div></div>
                    <div class="print-wp-cell"><div class="print-wp-label">Dep</div><div class="print-wp-val">${depTime}</div></div>
                    <div class="print-wp-cell"><div class="print-wp-label">Stay</div><div class="print-wp-val">${wp.stayDurationMinutes || 0}m</div></div>
                  </div>`;
         card += `<div class="print-wp-row">
                    <div class="print-wp-cell"><div class="print-wp-label">Lat</div><div class="print-wp-val">${wp.lat.toFixed(5)}</div></div>
                    <div class="print-wp-cell"><div class="print-wp-label">Lng</div><div class="print-wp-val">${wp.lng.toFixed(5)}</div></div>
                    <div class="print-wp-cell"><div class="print-wp-label">Budget</div><div class="print-wp-val">$${wp.budget || 0}</div></div>
                  </div>`;
      }
      
      if (wp.notes) {
        card += `<div class="print-wp-notes">${wp.notes}</div>`;
      }
      card += `</div>`;
      return card;
    });

    const totalBudget = tripWaypoints.reduce((acc, wp) => acc + (wp.budget || 0), 0);
    let headerHTML = `
      <div class="print-header-brand">Iter Viae : Tactical Itinerary</div>
      <h1 class="print-header-title">${tripTitle}</h1>
      <div class="print-header-meta">TOTAL BUDGET: $${totalBudget} &nbsp;&nbsp;|&nbsp;&nbsp; WAYPOINTS: ${tripWaypoints.length}</div>
      ${tripNotes ? `<div class="print-header-notes">${tripNotes}</div>` : ''}
    `;

    let logicalPages: string[] = [];
    let currentWpIndex = 0;
    let logicalPageNum = 1;

    while (currentWpIndex < cards.length || logicalPageNum === 1) {
      let pageCapacity = (logicalPageNum === 1) ? firstPageCapacity : subsequentPageCapacity;
      let pageCards = cards.slice(currentWpIndex, currentWpIndex + pageCapacity);
      
      let pageHtml = '';
      if (logicalPageNum === 1) pageHtml += headerHTML;
      pageHtml += pageCards.join('');
      
      logicalPages.push(pageHtml);
      currentWpIndex += pageCapacity;
      logicalPageNum++;
      if (currentWpIndex >= cards.length) break;
    }

    let html = '';
    
    if (size === 'field-notes') {
       // Pack 2 logical pages per physical 8.5x11 sheet
       for (let i = 0; i < logicalPages.length; i += 2) {
          html += `<div class="print-sheet size-field-notes">`;
          html += `<div class="print-bounds">${logicalPages[i]}</div>`;
          if (i + 1 < logicalPages.length) {
              html += `<div class="print-bounds">${logicalPages[i+1]}</div>`;
          }
          html += `</div>`;
       }
    } else if (size === 'a5') {
       // Pack 1 logical page per physical sheet
       for (let i = 0; i < logicalPages.length; i++) {
          html += `<div class="print-sheet size-a5">`;
          html += `<div class="print-bounds">${logicalPages[i]}</div>`;
          html += `</div>`;
       }
    } else if (size === 'letter') {
       for (let i = 0; i < logicalPages.length; i++) {
          html += `<div class="print-sheet size-letter">`;
          html += logicalPages[i];
          html += `</div>`;
       }
    }

    return html;
  }

  // ── Fuel & Gas Stop Auto-Planner ──────────────────────────────────────────
  const gasModal = document.getElementById("gas-modal");
  const gasPlannerBtn = document.getElementById("trip-gas-planner-btn");
  const gasModalClose = document.getElementById("gas-modal-close");
  const gasModalDone = document.getElementById("gas-modal-done");
  const gasRangeInput = document.getElementById("gas-range-input") as HTMLInputElement;
  const gasBufferInput = document.getElementById("gas-buffer-input") as HTMLInputElement;
  const gasCorridorWidthInput = document.getElementById("gas-corridor-width-input") as HTMLInputElement;
  const gasShowCorridorsToggle = document.getElementById("gas-show-corridors-toggle") as HTMLInputElement;
  const gasCalcBtn = document.getElementById("gas-calc-btn");
  const gasResultsContainer = document.getElementById("gas-results-container");
  const gasAddAllBtn = document.getElementById("gas-add-all-btn");

  function clearFuelCorridors() {
    if (map.getLayer("fuel-corridors-outline")) map.removeLayer("fuel-corridors-outline");
    if (map.getLayer("fuel-corridors-fill")) map.removeLayer("fuel-corridors-fill");
    if (map.getSource("fuel-corridors-source")) map.removeSource("fuel-corridors-source");
  }

  function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3958.8; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function refreshFuelCorridorsIfActive() {
    if (gasShowCorridorsToggle?.checked && currentRouteLineCoords && currentRouteLineCoords.length >= 2) {
      const maxRange = parseFloat(gasRangeInput?.value || "300");
      const buffer = parseFloat(gasBufferInput?.value || "30");
      const corridorWidth = parseFloat(gasCorridorWidthInput?.value || "5");
      renderFuelCorridors(currentRouteLineCoords, maxRange, buffer, corridorWidth);
    } else {
      clearFuelCorridors();
    }
    if (gasModal && gasModal.style.display !== "none") {
      analyzeGasStops();
    }
  }



  function sliceCoordsByDistance(
    coords: number[][],
    cumDistances: number[],
    startDist: number,
    endDist: number
  ): number[][] {
    if (!coords || coords.length < 2 || cumDistances.length !== coords.length) return [];
    
    let startIdx = 0;
    while (startIdx < cumDistances.length - 1 && cumDistances[startIdx + 1] < startDist) {
      startIdx++;
    }
    
    let endIdx = startIdx;
    while (endIdx < cumDistances.length - 1 && cumDistances[endIdx] < endDist) {
      endIdx++;
    }

    const sub = coords.slice(startIdx, Math.min(coords.length, endIdx + 1));
    if (sub.length < 2) return [];
    return sub;
  }

  function renderFuelCorridors(
    lineCoords: number[][],
    maxRange: number,
    _buffer: number,
    _corridorWidthMiles: number
  ) {
    if (!lineCoords || lineCoords.length < 2) {
      clearFuelCorridors();
      return;
    }

    const safeMaxRange = Math.max(20, isNaN(maxRange) ? 300 : maxRange);

    try {
      // 1. Calculate cumulative distances along route
      const cumDistances: number[] = [0];
      let totalLengthMiles = 0;
      for (let i = 1; i < lineCoords.length; i++) {
        const prev = lineCoords[i - 1];
        const curr = lineCoords[i];
        const seg = haversineMiles(prev[1], prev[0], curr[1], curr[0]);
        totalLengthMiles += seg;
        cumDistances.push(totalLengthMiles);
      }

      if (totalLengthMiles <= 0.05) {
        clearFuelCorridors();
        return;
      }

      // 2. Identify all waypoints labeled as "Gas" or "Fuel" to reset range accumulator
      const gasStopDistances: number[] = [];
      for (const wp of tripWaypoints) {
        const t = (wp.type || "").toLowerCase();
        const n = (wp.name || "").toLowerCase();
        if (t === "gas" || t === "fuel" || n.includes("gas") || n.includes("fuel") || n.includes("refuel")) {
          let bestIdx = 0;
          let bestDistSq = Infinity;
          for (let i = 0; i < lineCoords.length; i++) {
            const dx = lineCoords[i][0] - wp.lng;
            const dy = lineCoords[i][1] - wp.lat;
            const dSq = dx * dx + dy * dy;
            if (dSq < bestDistSq) {
              bestDistSq = dSq;
              bestIdx = i;
            }
          }
          const loc = cumDistances[bestIdx];
          if (loc > 0.1 && loc < totalLengthMiles - 0.1) {
            gasStopDistances.push(loc);
          }
        }
      }

      gasStopDistances.sort((a, b) => a - b);

      const refuelPoints: number[] = [0];
      for (const d of gasStopDistances) {
        if (d - refuelPoints[refuelPoints.length - 1] > 0.5) {
          refuelPoints.push(d);
        }
      }

      const greenRange = safeMaxRange * 0.8;
      const yellowRange = safeMaxRange * 1.0;
      const features: any[] = [];

      for (let i = 0; i < refuelPoints.length; i++) {
        const legStart = refuelPoints[i];
        const legEnd = (i + 1 < refuelPoints.length) ? refuelPoints[i + 1] : totalLengthMiles;
        const legSpan = legEnd - legStart;
        const legNum = i + 1;

        if (legSpan <= 0) continue;

        const greenEnd = legStart + Math.min(legSpan, greenRange);
        const yellowEnd = legStart + Math.min(legSpan, yellowRange);
        const redEnd = legEnd;

        // 1. Green Zone
        if (greenEnd > legStart + 0.05) {
          const sub = sliceCoordsByDistance(lineCoords, cumDistances, legStart, greenEnd);
          if (sub.length >= 2) {
            features.push(turf.lineString(sub, { zone: "green", leg: legNum }));
          }
        }

        // 2. Yellow Zone
        if (yellowEnd > greenEnd + 0.05) {
          const sub = sliceCoordsByDistance(lineCoords, cumDistances, greenEnd, yellowEnd);
          if (sub.length >= 2) {
            features.push(turf.lineString(sub, { zone: "yellow", leg: legNum }));
          }
        }

        // 3. Red Zone
        if (redEnd > yellowEnd + 0.05) {
          const sub = sliceCoordsByDistance(lineCoords, cumDistances, yellowEnd, redEnd);
          if (sub.length >= 2) {
            features.push(turf.lineString(sub, { zone: "red", leg: legNum }));
          }
        }
      }

      const corridorGeoJson: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features
      };

      const source = map.getSource("fuel-corridors-source") as maplibregl.GeoJSONSource;
      if (source) {
        source.setData(corridorGeoJson);
      } else {
        map.addSource("fuel-corridors-source", {
          type: "geojson",
          data: corridorGeoJson
        });

        const beforeLayer = map.getLayer("trip-route-layer") ? "trip-route-layer" : undefined;

        map.addLayer(
          {
            id: "fuel-corridors-fill",
            type: "line",
            source: "fuel-corridors-source",
            layout: {
              "line-join": "round",
              "line-cap": "round"
            },
            paint: {
              "line-color": [
                "match",
                ["get", "zone"],
                "green",
                "#10b981",
                "yellow",
                "#f59e0b",
                "red",
                "#ef4444",
                "#94a3b8"
              ],
              "line-width": [
                "interpolate",
                ["exponential", 1.4],
                ["zoom"],
                3, 4,
                8, 14,
                12, 32,
                16, 80
              ],
              "line-opacity": 0.5
            }
          },
          beforeLayer
        );
      }
    } catch (e) {
      console.error("Failed to render fuel corridors:", e);
    }
  }

  function openGasModal() {
    if (gasModal) {
      gasModal.style.display = "flex";
      analyzeGasStops();
    }
  }

  gasPlannerBtn?.addEventListener("click", openGasModal);

  gasModalClose?.addEventListener("click", () => {
    if (gasModal) gasModal.style.display = "none";
  });

  gasModalDone?.addEventListener("click", () => {
    if (gasModal) gasModal.style.display = "none";
  });

  gasCalcBtn?.addEventListener("click", () => {
    analyzeGasStops();
  });

  let gasInputDebounceTimer: any = null;
  const triggerGasRefreshDebounced = () => {
    if (gasInputDebounceTimer) clearTimeout(gasInputDebounceTimer);
    gasInputDebounceTimer = setTimeout(() => {
      refreshFuelCorridorsIfActive();
    }, 150);
  };

  gasRangeInput?.addEventListener("input", triggerGasRefreshDebounced);
  gasBufferInput?.addEventListener("input", triggerGasRefreshDebounced);
  gasCorridorWidthInput?.addEventListener("input", triggerGasRefreshDebounced);

  [gasRangeInput, gasBufferInput, gasCorridorWidthInput].forEach(inp => {
    if (!inp) return;
    const handleSelectAll = () => setTimeout(() => inp.select(), 0);
    inp.addEventListener("focus", handleSelectAll);
    inp.addEventListener("click", handleSelectAll);
  });

  gasShowCorridorsToggle?.addEventListener("change", () => {
    if (gasShowCorridorsToggle.checked) {
      const maxRange = parseFloat(gasRangeInput?.value || "300");
      const buffer = parseFloat(gasBufferInput?.value || "30");
      const corridorWidth = parseFloat(gasCorridorWidthInput?.value || "5");
      renderFuelCorridors(currentRouteLineCoords, maxRange, buffer, corridorWidth);
    } else {
      clearFuelCorridors();
    }
  });

  function analyzeGasStops() {
    if (!gasResultsContainer) return;
    if (gasAddAllBtn) gasAddAllBtn.style.display = "none";

    const rawRange = parseFloat(gasRangeInput?.value || "300");
    const maxRange = Math.max(20, isNaN(rawRange) ? 300 : rawRange);

    const rawBuffer = parseFloat(gasBufferInput?.value || "30");
    const buffer = Math.max(0, isNaN(rawBuffer) ? 30 : rawBuffer);

    const rawCorridor = parseFloat(gasCorridorWidthInput?.value || "5");
    const corridorWidth = Math.max(0.5, isNaN(rawCorridor) ? 5 : rawCorridor);

    const showCorridors = gasShowCorridorsToggle?.checked ?? true;

    if (tripWaypoints.length < 2) {
      gasResultsContainer.innerHTML = `<div style="color: #ef4444; font-size: 0.85rem; text-align: center; padding: 20px;">Route requires at least 2 waypoints to analyze gas stops.</div>`;
      clearFuelCorridors();
      return;
    }

    if (!currentRouteLineCoords || currentRouteLineCoords.length < 2) {
      gasResultsContainer.innerHTML = `<div style="color: #f59e0b; font-size: 0.85rem; text-align: center; padding: 20px;">No calculated road route found. Please wait for route calculation to complete.</div>`;
      clearFuelCorridors();
      return;
    }

    // Render shaded corridors on map if enabled
    if (showCorridors) {
      renderFuelCorridors(currentRouteLineCoords, maxRange, buffer, corridorWidth);
    } else {
      clearFuelCorridors();
    }

    const cumDistances: number[] = [0];
    let totalDist = 0;
    for (let i = 1; i < currentRouteLineCoords.length; i++) {
      const prev = currentRouteLineCoords[i - 1];
      const curr = currentRouteLineCoords[i];
      const seg = haversineMiles(prev[1], prev[0], curr[1], curr[0]);
      totalDist += seg;
      cumDistances.push(totalDist);
    }

    const gasStopDistances: number[] = [];
    for (const wp of tripWaypoints) {
      const t = (wp.type || "").toLowerCase();
      const n = (wp.name || "").toLowerCase();
      if (t === "gas" || t === "fuel" || n.includes("gas") || n.includes("fuel") || n.includes("refuel")) {
        let bestIdx = 0;
        let bestDistSq = Infinity;
        for (let i = 0; i < currentRouteLineCoords.length; i++) {
          const dx = currentRouteLineCoords[i][0] - wp.lng;
          const dy = currentRouteLineCoords[i][1] - wp.lat;
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestIdx = i;
          }
        }
        const loc = cumDistances[bestIdx];
        if (loc > 0.1 && loc < totalDist - 0.1) {
          gasStopDistances.push(loc);
        }
      }
    }

    gasStopDistances.sort((a, b) => a - b);
    const refuelPoints: number[] = [0];
    for (const d of gasStopDistances) {
      if (d - refuelPoints[refuelPoints.length - 1] > 0.5) {
        refuelPoints.push(d);
      }
    }

    const greenRange = maxRange * 0.8;
    const yellowRange = maxRange * 1.0;

    let htmlResults = '';
    let hasRedZone = false;

    for (let i = 0; i < refuelPoints.length; i++) {
      const legStart = refuelPoints[i];
      const legEnd = (i + 1 < refuelPoints.length) ? refuelPoints[i + 1] : totalDist;
      const legSpan = legEnd - legStart;
      const legNum = i + 1;

      if (legSpan <= 0) continue;

      const greenEnd = legStart + Math.min(legSpan, greenRange);
      const yellowEnd = legStart + Math.min(legSpan, yellowRange);
      const redEnd = legEnd;

      const isExceeded = (redEnd > yellowEnd + 0.1);
      if (isExceeded) hasRedZone = true;

      const legTitle = (i === 0 && refuelPoints.length === 1)
        ? `FULL ROUTE (Trip Distance: ${totalDist.toFixed(1)} mi)`
        : `LEG #${legNum}: Mile ${legStart.toFixed(0)} → ${legEnd.toFixed(0)} (${legSpan.toFixed(1)} mi)`;

      htmlResults += `
        <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid ${isExceeded ? 'rgba(239, 68, 68, 0.5)' : '#334155'}; border-radius: 6px; padding: 12px;">
          <div style="font-size: 0.85rem; font-weight: 700; color: ${isExceeded ? '#fca5a5' : '#f59e0b'}; letter-spacing: 0.05em; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
            <span>${legTitle}</span>
            ${isExceeded ? '<span style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; padding: 2px 6px; border-radius: 3px; font-size: 0.7rem; font-weight: bold;">⚠️ EXCEEDS FUEL RANGE</span>' : '<span style="color: #34d399; font-size: 0.7rem;">✓ REFUEL OK</span>'}
          </div>
          <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem;">
            <div style="color: #34d399;">🟩 <strong>Green Zone (0–80%):</strong> Miles ${legStart.toFixed(0)} – ${greenEnd.toFixed(0)} (Safe Driving)</div>
            ${yellowEnd > greenEnd + 0.1 ? `<div style="color: #fbbf24;">🟨 <strong>Yellow Zone (80–100%):</strong> Miles ${greenEnd.toFixed(0)} – ${yellowEnd.toFixed(0)} (Optimal Refuel Window)</div>` : ''}
            ${isExceeded ? `<div style="color: #fca5a5; font-weight: bold;">🟥 <strong>Red Zone (100%+):</strong> Miles ${yellowEnd.toFixed(0)} – ${redEnd.toFixed(0)} (⚠️ FUEL EXHAUSTED - ADD GAS STOP HERE!)</div>` : ''}
          </div>
        </div>
      `;
    }

    if (hasRedZone) {
      htmlResults = `
        <div style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); padding: 10px 12px; border-radius: 6px; color: #fca5a5; font-size: 0.8rem; margin-bottom: 8px;">
          <strong>⚠️ Refuel Warning:</strong> Route has shaded RED sections past your vehicle's ${maxRange} mi fuel range. Add a Gas stop in the Yellow or Red zones on your map!
        </div>
      ` + htmlResults;
    } else {
      htmlResults = `
        <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); padding: 10px 12px; border-radius: 6px; color: #34d399; font-size: 0.8rem; margin-bottom: 8px;">
          <strong>✓ Refuel Plan Valid:</strong> All route legs between Gas stops are within your ${maxRange} mi vehicle fuel range.
        </div>
      ` + htmlResults;
    }

    gasResultsContainer.innerHTML = htmlResults;
  }

  listen("menu-file-new", () => newTrip());
  listen("menu-file-load", () => loadTrip());
  listen("menu-file-save", () => saveTrip());
  listen("menu-file-save-as", () => saveTripAs());
  listen("menu-file-print", () => openPrintModal());
  listen("menu-tools-gas-planner", () => openGasModal());

  return map;
}

window.addEventListener('DOMContentLoaded', () => {
  initMap();
});
