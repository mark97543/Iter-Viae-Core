import * as maplibregl from "maplibre-gl";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

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

  return map;
}

window.addEventListener("DOMContentLoaded", () => {
  initMap();
});
