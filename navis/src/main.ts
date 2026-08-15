import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { invoke } from '@tauri-apps/api/core';
import { loadVoicePack, speakPrompt, setVoiceMuted, isVoiceMuted } from './voice_engine';

interface Waypoint {
  id: string;
  lat: number;
  lng: number;
  name: string;
  type?: string;
}

let map: maplibregl.Map;
let activeWaypoints: Waypoint[] = [];
let currentRouteCoords: number[][] = [];
let userGpsLocation: { lat: number; lng: number } | null = null;
let followGps = true;
let isOffRoute = false;
let isMapLoaded = false;

// Register custom protocol handler for local MBTiles vector tiles via Tauri IPC
if ('addProtocol' in maplibregl) {
  maplibregl.addProtocol("mbtiles", async (params: maplibregl.RequestParameters) => {
    const rawUrl = params.url;
    // Strip protocol prefix (mbtiles://localhost/ or mbtiles://)
    const cleanUrl = rawUrl.replace(/^mbtiles:\/\/[^\/]*\//, "").replace(/^mbtiles:\/\//, "");
    const parts = cleanUrl.split("/");
    if (parts.length < 3) {
      return { data: new ArrayBuffer(0) };
    }

    const z = parseInt(parts[parts.length - 3], 10);
    const x = parseInt(parts[parts.length - 2], 10);
    const y = parseInt(parts[parts.length - 1], 10);

    if (isNaN(z) || isNaN(x) || isNaN(y)) {
      return { data: new ArrayBuffer(0) };
    }

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
}

// Polyline6 decoder for local Valhalla routing sidecar shape decoding
function decodePolyline(encoded: string, precision = 6): number[][] {
  let index = 0, lat = 0, lng = 0;
  const coordinates: number[][] = [];
  const factor = Math.pow(10, precision);

  while (index < encoded.length) {
    let byte = 0, shift = 0, result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += deltaLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += deltaLng;

    coordinates.push([lng / factor, lat / factor]);
  }
  return coordinates;
}

// Haversine distance in meters
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Distance from point to line segment in meters
function distanceToLineSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
  if (l2 === 0) return haversineMeters(py, px, y1, x1);
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return haversineMeters(py, px, projY, projX);
}

// Minimum distance from GPS point to any segment of route polyline
function minDistanceToRoute(lat: number, lng: number, route: number[][]): number {
  if (!route || route.length < 2) return 0;
  let minDistance = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const p1 = route[i];
    const p2 = route[i + 1];
    const dist = distanceToLineSegment(lng, lat, p1[0], p1[1], p2[0], p2[1]);
    if (dist < minDistance) minDistance = dist;
  }
  return minDistance;
}

// Render dynamic tactical coordinate grid lines
function renderTacticalGrid(mapInstance: maplibregl.Map) {
  if (!mapInstance || !isMapLoaded) return;
  try {
    const bounds = mapInstance.getBounds();
    const west = bounds.getWest();
    const east = bounds.getEast();
    const south = bounds.getSouth();
    const north = bounds.getNorth();

    const zoom = mapInstance.getZoom();
    let step = 0.05;
    if (zoom < 8) step = 0.5;
    else if (zoom < 11) step = 0.1;
    else if (zoom > 14) step = 0.01;

    const features: any[] = [];

    const startLng = Math.floor(west / step) * step;
    const endLng = Math.ceil(east / step) * step;
    for (let lng = startLng; lng <= endLng; lng += step) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [[lng, south], [lng, north]]
        },
        properties: {}
      });
    }

    const startLat = Math.floor(south / step) * step;
    const endLat = Math.ceil(north / step) * step;
    for (let lat = startLat; lat <= endLat; lat += step) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [[west, lat], [east, lat]]
        },
        properties: {}
      });
    }

    const gridSource = mapInstance.getSource('tactical-grid') as maplibregl.GeoJSONSource;
    if (gridSource) {
      gridSource.setData({ type: 'FeatureCollection', features });
    }
  } catch (e) {
    console.warn("Tactical grid error:", e);
  }
}

// Initialize MapLibre Engine (100% Offline Vector Basemap)
function initNavisMap() {
  const offlineStyle: maplibregl.StyleSpecification = {
    version: 8,
    name: "Navis Offline Tactical Basemap",
    sources: {
      "openmaptiles": {
        type: "vector",
        tiles: ["mbtiles://localhost/{z}/{x}/{y}"],
        minzoom: 0,
        maxzoom: 14
      }
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#090d16" }
      },
      // 100% Offline Vector Tile Map Layers
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
        paint: { "line-color": "#1d4ed8", "line-width": 2 }
      },
      {
        id: "building",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "building",
        paint: { "fill-color": "#1e293b", "fill-outline-color": "#334155", "fill-opacity": 0.85 }
      },
      {
        id: "boundary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "boundary",
        paint: { "line-color": "#38bdf8", "line-opacity": 0.7, "line-width": 1.5, "line-dasharray": [3, 2] }
      },
      {
        id: "transportation_minor",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["in", "class", "minor", "service", "track", "residential", "unclassified"],
        minzoom: 11,
        paint: { "line-color": "#1e293b", "line-width": 1.5 }
      },
      {
        id: "transportation_secondary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["in", "class", "secondary", "tertiary"],
        minzoom: 8,
        paint: { "line-color": "#64748b", "line-width": 2 }
      },
      {
        id: "transportation_primary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["in", "class", "primary"],
        minzoom: 6,
        paint: { "line-color": "#38bdf8", "line-width": 3 }
      },
      {
        id: "transportation_motorway",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["in", "class", "motorway", "trunk", "expressway"],
        minzoom: 4,
        paint: { "line-color": "#f59e0b", "line-width": 3.5 }
      },
      // Place Labels from Vector Tiles
      {
        id: "place_label_city",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        filter: ["in", "class", "city", "town"],
        minzoom: 4,
        layout: {
          "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
          "text-size": 13,
          "text-transform": "uppercase"
        },
        paint: {
          "text-color": "#f8fafc",
          "text-halo-color": "#090d16",
          "text-halo-width": 2
        }
      }
    ]
  };

  map = new maplibregl.Map({
    container: 'map',
    style: offlineStyle,
    center: [-122.3321, 47.6062], // Seattle default
    zoom: 12,
    pitch: 45,
    maxZoom: 18
  });

  const handleResize = () => {
    map?.resize();
  };
  window.addEventListener('resize', handleResize);
  window.addEventListener('orientationchange', () => {
    setTimeout(handleResize, 200);
  });

  map.on('webglcontextlost', () => {
    console.warn("WebGL context lost on mobile WebView, restoring...");
  });

  map.on('webglcontextrestored', () => {
    map.resize();
    map.triggerRepaint();
  });

  map.on('load', () => {
    isMapLoaded = true;
    handleResize();

    // Add Tactical Grid Source & Layer
    map.addSource('tactical-grid', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: 'tactical-grid-line',
      type: 'line',
      source: 'tactical-grid',
      paint: {
        'line-color': '#1e3a5f',
        'line-width': 1,
        'line-dasharray': [4, 4],
        'line-opacity': 0.6
      }
    });

    // Add Route Polyline Source & Layers
    map.addSource('nav-route', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: 'nav-route-casing',
      type: 'line',
      source: 'nav-route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#0284c7',
        'line-width': 10,
        'line-opacity': 0.6
      }
    });

    map.addLayer({
      id: 'nav-route-line',
      type: 'line',
      source: 'nav-route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#38bdf8',
        'line-width': 6
      }
    });

    // Add Waypoint Markers Source & Layers
    map.addSource('waypoint-markers', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: 'waypoint-markers-glow',
      type: 'circle',
      source: 'waypoint-markers',
      paint: {
        'circle-radius': 10,
        'circle-color': 'rgba(16, 185, 129, 0.4)',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#10b981'
      }
    });

    map.addLayer({
      id: 'waypoint-markers-dot',
      type: 'circle',
      source: 'waypoint-markers',
      paint: {
        'circle-radius': 6,
        'circle-color': '#10b981'
      }
    });

    // Add GPS Position Marker Source & Layer
    map.addSource('gps-position', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: 'gps-position-glow',
      type: 'circle',
      source: 'gps-position',
      paint: {
        'circle-radius': 16,
        'circle-color': 'rgba(56, 189, 248, 0.3)',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#38bdf8'
      }
    });

    map.addLayer({
      id: 'gps-position-dot',
      type: 'circle',
      source: 'gps-position',
      paint: {
        'circle-radius': 8,
        'circle-color': '#0284c7',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    });

    // Render tactical grid
    renderTacticalGrid(map);
    map.on('moveend', () => renderTacticalGrid(map));
    map.on('zoomend', () => renderTacticalGrid(map));

    // Start Voice Engine & GPS Watcher
    void loadVoicePack().then(() => {
      speakPrompt('system', 'app_startup');
    });

    startGpsTracking();

    // Render active waypoints if loaded before map finished loading
    if (activeWaypoints.length > 0) {
      void updateRoutePolyline(activeWaypoints);
    } else {
      restoreLastTrip();
    }
  });
}

// Real-time GPS Location Tracking
function startGpsTracking() {
  if (!('geolocation' in navigator)) return;

  navigator.geolocation.watchPosition((pos) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    userGpsLocation = { lat, lng };

    if (isMapLoaded && map) {
      const gpsSource = map.getSource('gps-position') as maplibregl.GeoJSONSource;
      if (gpsSource) {
        gpsSource.setData({
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [lng, lat] },
            properties: {}
          }]
        });
      }

      if (followGps) {
        map.easeTo({ center: [lng, lat], zoom: 15, pitch: 45 });
      }
    }

    checkAutoReroute(lat, lng);
  }, (err) => {
    console.warn("GPS Tracking notice:", err);
  }, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 10000
  });
}

// Local Offline Auto-Rerouting Logic (> 50m off route)
function checkAutoReroute(lat: number, lng: number) {
  if (!currentRouteCoords || currentRouteCoords.length < 2) return;

  const distOffRoute = minDistanceToRoute(lat, lng, currentRouteCoords);
  if (distOffRoute > 50) {
    if (!isOffRoute) {
      isOffRoute = true;
      speakPrompt('maneuver', 'off_route');
      recalculateRouteFromGps(lat, lng);
    }
  } else {
    isOffRoute = false;
  }
}

// Local Route Recalculation
function recalculateRouteFromGps(lat: number, lng: number) {
  if (activeWaypoints.length === 0) return;

  const gpsWp: Waypoint = {
    id: 'gps-start',
    lat,
    lng,
    name: 'Current Location',
    type: 'GPS'
  };

  const reroutedWaypoints = [gpsWp, ...activeWaypoints];
  void updateRoutePolyline(reroutedWaypoints);
}

// Robust Parse and Load Trip (.viae, .vaie, .json, .geojson, raw text)
function parseAndLoadTrip(rawContent: string, sourceName = 'Loaded Trip') {
  if (!rawContent || !rawContent.trim()) return;

  // Clean UTF-8 BOM
  const jsonText = rawContent.replace(/^\uFEFF/, '').trim();

  let rawWaypoints: any[] = [];
  let title = sourceName.replace(/\.[^/.]+$/, "");

  try {
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
      rawWaypoints = parsed;
    } else if (parsed && typeof parsed === 'object') {
      title = parsed.tripTitle || parsed.title || parsed.name || title;
      if (Array.isArray(parsed.tripWaypoints)) {
        rawWaypoints = parsed.tripWaypoints;
      } else if (Array.isArray(parsed.waypoints)) {
        rawWaypoints = parsed.waypoints;
      } else if (Array.isArray(parsed.points)) {
        rawWaypoints = parsed.points;
      } else if (Array.isArray(parsed.nodes)) {
        rawWaypoints = parsed.nodes;
      } else if (Array.isArray(parsed.locations)) {
        rawWaypoints = parsed.locations;
      } else if (parsed.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
        rawWaypoints = parsed.features.map((f: any, idx: number) => ({
          id: f.id || `feat-${idx}`,
          lat: f.geometry?.coordinates?.[1],
          lng: f.geometry?.coordinates?.[0],
          name: f.properties?.name || f.properties?.title || `Waypoint ${idx + 1}`,
          type: f.properties?.type || 'Waypoint'
        }));
      }
    }
  } catch (err) {
    // Fallback: Line-by-line coordinate extraction for plain text coordinate files
    const lines = jsonText.split(/[\r\n]+/);
    let lineIdx = 0;
    for (const line of lines) {
      const match = line.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
      if (match) {
        lineIdx++;
        const p1 = parseFloat(match[1]);
        const p2 = parseFloat(match[2]);
        // Determine lat vs lng based on ranges
        const lat = Math.abs(p1) <= 90 ? p1 : p2;
        const lng = Math.abs(p1) <= 90 ? p2 : p1;
        rawWaypoints.push({
          id: `wp-line-${lineIdx}`,
          lat,
          lng,
          name: `Stop ${lineIdx}`
        });
      }
    }
  }

  const normalizedWaypoints: Waypoint[] = [];
  for (let i = 0; i < rawWaypoints.length; i++) {
    const w = rawWaypoints[i];
    if (!w || typeof w !== 'object') continue;

    const lat = parseFloat(w.lat ?? w.latitude ?? w.y ?? (Array.isArray(w.coordinates) ? w.coordinates[1] : NaN));
    const lng = parseFloat(w.lng ?? w.lon ?? w.longitude ?? w.x ?? (Array.isArray(w.coordinates) ? w.coordinates[0] : NaN));

    if (isNaN(lat) || isNaN(lng)) continue;

    normalizedWaypoints.push({
      id: String(w.id || `wp-${i + 1}`),
      lat,
      lng,
      name: String(w.name || w.title || w.label || `Stop ${i + 1}`),
      type: w.type ? String(w.type) : (i === 0 ? 'Start' : (i === rawWaypoints.length - 1 ? 'End' : 'Waypoint'))
    });
  }

  if (normalizedWaypoints.length === 0) {
    alert("No valid waypoints found in trip file. Please ensure file contains valid GPS coordinates.");
    return;
  }

  activeWaypoints = normalizedWaypoints;

  // Calculate total miles
  let totalMeters = 0;
  for (let i = 0; i < activeWaypoints.length - 1; i++) {
    totalMeters += haversineMeters(
      activeWaypoints[i].lat, activeWaypoints[i].lng,
      activeWaypoints[i + 1].lat, activeWaypoints[i + 1].lng
    );
  }
  const totalMiles = Math.max(1, Math.round((totalMeters / 1609.34) * 10) / 10);

  // Save to localStorage for persistence
  try {
    localStorage.setItem('navis_active_trip', JSON.stringify(activeWaypoints));
    localStorage.setItem('navis_trip_title', title);
  } catch (e) {}

  void updateRoutePolyline(activeWaypoints);

  if (isMapLoaded && map) {
    map.flyTo({ center: [activeWaypoints[0].lng, activeWaypoints[0].lat], zoom: 11 });
  }

  speakPrompt('system', 'trip_loaded', {
    trip_title: title,
    total_miles: totalMiles
  });
}

// Restore previous trip from localStorage if available
function restoreLastTrip() {
  try {
    const savedTrip = localStorage.getItem('navis_active_trip');
    if (savedTrip) {
      const waypoints = JSON.parse(savedTrip);
      if (Array.isArray(waypoints) && waypoints.length > 0) {
        activeWaypoints = waypoints;
        void updateRoutePolyline(activeWaypoints);
      }
    }
  } catch (e) {}
}

// Update Map Polyline Geometry & Waypoint Markers with Valhalla Local Routing
async function updateRoutePolyline(waypoints: Waypoint[]) {
  if (!waypoints || waypoints.length === 0) return;

  let coords: number[][] = waypoints.map(w => [w.lng, w.lat]);

  // Attempt local Valhalla street-level routing if 2 or more waypoints exist
  if (waypoints.length >= 2) {
    try {
      const valhallaWps = waypoints.map(w => ({ lat: w.lat, lon: w.lng }));
      const result: any = await invoke("calculate_route", { waypoints: valhallaWps });
      if (result && result.geojson && result.geojson.trip && result.geojson.trip.legs) {
        const decodedCoords: number[][] = [];
        for (const leg of result.geojson.trip.legs) {
          if (leg.shape) {
            const pts = decodePolyline(leg.shape, 6);
            decodedCoords.push(...pts);
          }
        }
        if (decodedCoords.length > 0) {
          coords = decodedCoords;
        }
      }
    } catch (e) {
      console.warn("Local Valhalla sidecar offline, fallback to straight-line polyline:", e);
    }
  }

  currentRouteCoords = coords;

  if (!isMapLoaded || !map) return;

  // 1. Update Polyline
  const routeSource = map.getSource('nav-route') as maplibregl.GeoJSONSource;
  if (routeSource) {
    const geometryData = coords.length === 1
      ? { type: 'Point' as const, coordinates: coords[0] }
      : { type: 'LineString' as const, coordinates: coords };

    routeSource.setData({
      type: 'Feature',
      geometry: geometryData,
      properties: {}
    });
  }

  // 2. Update Waypoint Markers
  const wpSource = map.getSource('waypoint-markers') as maplibregl.GeoJSONSource;
  if (wpSource) {
    const features = waypoints.map(w => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [w.lng, w.lat] },
      properties: { name: w.name, type: w.type || 'Waypoint' }
    }));
    wpSource.setData({ type: 'FeatureCollection', features });
  }

  // 3. Auto-Fit Camera to Route Bounds
  if (waypoints.length > 1) {
    const bounds = new maplibregl.LngLatBounds();
    waypoints.forEach(w => bounds.extend([w.lng, w.lat]));
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 80, maxZoom: 15 });
    }
  } else if (waypoints.length === 1) {
    map.flyTo({ center: [waypoints[0].lng, waypoints[0].lat], zoom: 14 });
  }

  // 4. Update Navigation Banner
  const streetBanner = document.getElementById('nav-street-name');
  const subInfoBanner = document.getElementById('nav-sub-info');
  if (streetBanner && subInfoBanner) {
    const nextWp = waypoints[1] || waypoints[0];
    streetBanner.textContent = `Heading to ${nextWp.name}`;
    subInfoBanner.textContent = `${waypoints.length} waypoints on tactical route`;
  }
}

// Single-Point Coordinate Search UI
function initSearchUI() {
  const input = document.getElementById('coord-search-input') as HTMLInputElement | null;
  const btn = document.getElementById('coord-search-btn') as HTMLButtonElement | null;

  function doSearch() {
    if (!input || !input.value.trim()) return;
    const val = input.value.replace(/[^\d.\-,\s]/g, '');
    const parts = val.split(/[,\s]+/).filter(p => p.length > 0);
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng)) {
        const destWp: Waypoint = {
          id: 'search-dest',
          lat,
          lng,
          name: `Target (${lat.toFixed(4)}, ${lng.toFixed(4)})`
        };

        const startPt = userGpsLocation 
          ? { id: 'gps', lat: userGpsLocation.lat, lng: userGpsLocation.lng, name: 'Current Location' }
          : { id: 'default', lat: 47.6062, lng: -122.3321, name: 'Start' };

        activeWaypoints = [startPt, destWp];
        void updateRoutePolyline(activeWaypoints);
        if (isMapLoaded && map) {
          map.flyTo({ center: [lng, lat], zoom: 14 });
        }
      }
    }
  }

  btn?.addEventListener('click', doSearch);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
}

// UI Controls & Modal Event Listeners
function initDockControls() {
  const btnRecenter = document.getElementById('btn-recenter');
  const btnLoadTrip = document.getElementById('btn-load-trip');
  const btnVoiceToggle = document.getElementById('btn-voice-toggle');
  const tripFileInput = document.getElementById('trip-file-input') as HTMLInputElement | null;

  // Modal elements
  const tripModal = document.getElementById('trip-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalVisibleFileInput = document.getElementById('modal-visible-file-input') as HTMLInputElement | null;
  const btnLoadDemoTrip = document.getElementById('btn-load-demo-trip');
  const btnLoadPastedTrip = document.getElementById('btn-load-pasted-trip');
  const tripPasteInput = document.getElementById('trip-paste-input') as HTMLTextAreaElement | null;

  btnRecenter?.addEventListener('click', () => {
    followGps = true;
    if (userGpsLocation && isMapLoaded && map) {
      map.flyTo({ center: [userGpsLocation.lng, userGpsLocation.lat], zoom: 15, pitch: 45 });
    }
  });

  btnVoiceToggle?.addEventListener('click', () => {
    const nextMuted = !isVoiceMuted();
    setVoiceMuted(nextMuted);
    if (btnVoiceToggle) {
      btnVoiceToggle.classList.toggle('active', !nextMuted);
      btnVoiceToggle.textContent = nextMuted ? '🔇' : '🔊';
    }
  });

  // Open Trip Modal when folder button is tapped
  btnLoadTrip?.addEventListener('click', () => {
    if (tripModal) {
      tripModal.classList.remove('hidden');
    }
  });

  // Close modal
  const closeModal = () => {
    tripModal?.classList.add('hidden');
  };

  modalCloseBtn?.addEventListener('click', closeModal);
  tripModal?.addEventListener('click', (e) => {
    if (e.target === tripModal) closeModal();
  });

  // Visible modal file input
  modalVisibleFileInput?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      parseAndLoadTrip(text, file.name);
      closeModal();
    };
    reader.readAsText(file);
    (e.target as HTMLInputElement).value = '';
  });

  // Load Demo Tactical Route button
  btnLoadDemoTrip?.addEventListener('click', () => {
    const demoTrip = JSON.stringify({
      version: 1,
      tripTitle: "Seattle Tactical Operations Demo",
      tripWaypoints: [
        { id: "wp-1", lat: 47.6062, lng: -122.3321, name: "Seattle Downtown HQ", type: "Start" },
        { id: "wp-2", lat: 47.6101, lng: -122.3421, name: "Pike Place Outpost", type: "Waypoint" },
        { id: "wp-3", lat: 47.6205, lng: -122.3493, name: "Space Needle Terminal", type: "End" }
      ]
    });
    parseAndLoadTrip(demoTrip, "Seattle Tactical Operations Demo");
    closeModal();
  });

  // Load Pasted Trip JSON
  btnLoadPastedTrip?.addEventListener('click', () => {
    const content = tripPasteInput?.value.trim();
    if (content) {
      parseAndLoadTrip(content, "Pasted Trip Operation");
      closeModal();
    } else {
      alert("Please paste trip JSON data into the text box.");
    }
  });

  // Hidden File Input fallback
  tripFileInput?.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      parseAndLoadTrip(text, file.name);
    };
    reader.readAsText(file);
    (e.target as HTMLInputElement).value = '';
  });

  // Drag and drop trip files onto window
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        parseAndLoadTrip(text, file.name);
      };
      reader.readAsText(file);
    }
  });
}

window.addEventListener('DOMContentLoaded', () => {
  initNavisMap();
  initSearchUI();
  initDockControls();
});
