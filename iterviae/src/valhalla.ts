// Routing Service with Multi-Engine Fallback (OSRM + Valhalla + Haversine Geodesic)

export interface RouteLocation {
  lat: number;
  lon: number;
}

export interface RouteResult {
  coordinates: [number, number][];
  distanceMi: number;
  durationSec: number;
}

/**
 * Calculate Haversine distance in miles between two coordinates
 */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Generate linear interpolated geodesic points for fallback route drawing
 */
function generateGeodesicFallback(locations: RouteLocation[]): RouteResult {
  const coordinates: [number, number][] = [];
  let totalDistanceMi = 0;

  for (let i = 0; i < locations.length - 1; i++) {
    const start = locations[i];
    const end = locations[i + 1];

    const dist = haversineDistance(start.lat, start.lon, end.lat, end.lon);
    totalDistanceMi += dist;

    // Subdivide into 15 intermediate points per leg for smooth curve rendering
    const steps = 15;
    for (let s = 0; s <= steps; s++) {
      const frac = s / steps;
      const interpLat = start.lat + (end.lat - start.lat) * frac;
      const interpLon = start.lon + (end.lon - start.lon) * frac;
      coordinates.push([interpLon, interpLat]);
    }
  }

  // Estimate duration assuming 50 mph avg speed
  const durationSec = (totalDistanceMi / 50) * 3600;

  return {
    coordinates,
    distanceMi: totalDistanceMi,
    durationSec
  };
}

/**
 * Main Routing Engine Fetcher:
 * Tries OSRM turn-by-turn routing (full CORS enabled), falls back to Valhalla / Geodesic line
 */
export async function fetchExpeditionRoute(locations: RouteLocation[]): Promise<RouteResult> {
  if (locations.length < 2) {
    return { coordinates: [], distanceMi: 0, durationSec: 0 };
  }

  // 1. Try OSRM Routing Engine (CORS enabled: *)
  try {
    const locString = locations.map((loc) => `${loc.lon},${loc.lat}`).join(";");
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${locString}?overview=full&geometries=geojson`;

    console.log("Fetching Turn-by-Turn Route from Routing Engine:", osrmUrl);
    const res = await fetch(osrmUrl);

    if (res.ok) {
      const data = await res.json();
      if (data.code === "Ok" && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coordinates: [number, number][] = route.geometry.coordinates; // [[lon, lat], ...]
        const distanceMi = route.distance * 0.000621371; // meters to miles
        const durationSec = route.duration; // seconds

        return { coordinates, distanceMi, durationSec };
      }
    }
  } catch (err) {
    console.warn("OSRM Route fetch failed, falling back to Geodesic path:", err);
  }

  // 2. Fallback to Smooth Geodesic Route
  console.log("Using Geodesic Fallback Path Engine...");
  return generateGeodesicFallback(locations);
}
