// Routing Service with Multi-Engine Fallback & Unlimited Waypoint Batching

export interface RouteLocation {
  lat: number;
  lon: number;
}

export interface LegMetric {
  distanceMi: number;
  durationSec: number;
}

export interface RouteResult {
  coordinates: [number, number][];
  distanceMi: number;
  durationSec: number;
  legs: LegMetric[];
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
  const legs: LegMetric[] = [];

  for (let i = 0; i < locations.length - 1; i++) {
    const start = locations[i];
    const end = locations[i + 1];

    const dist = haversineDistance(start.lat, start.lon, end.lat, end.lon);
    totalDistanceMi += dist;

    const legDuration = (dist / 50) * 3600;
    legs.push({ distanceMi: dist, durationSec: legDuration });

    const steps = 15;
    for (let s = 0; s <= steps; s++) {
      const frac = s / steps;
      const interpLat = start.lat + (end.lat - start.lat) * frac;
      const interpLon = start.lon + (end.lon - start.lon) * frac;
      coordinates.push([interpLon, interpLat]);
    }
  }

  const durationSec = (totalDistanceMi / 50) * 3600;

  return {
    coordinates,
    distanceMi: totalDistanceMi,
    durationSec,
    legs
  };
}

/**
 * Single batch fetcher (max 25 locations per request)
 */
async function fetchSingleBatchRoute(locations: RouteLocation[]): Promise<RouteResult> {
  if (locations.length < 2) {
    return { coordinates: [], distanceMi: 0, durationSec: 0, legs: [] };
  }

  const locString = locations.map((loc) => `${loc.lon},${loc.lat}`).join(";");
  const standardUrl = `https://router.project-osrm.org/route/v1/driving/${locString}?overview=full&geometries=geojson&continue_straight=false`;

  try {
    let res = await fetch(standardUrl);
    let data = res.ok ? await res.json() : null;

    if (!data || data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      const unlimitedRadii = locations.map(() => "unlimited").join(";");
      const fallbackUrl = `https://router.project-osrm.org/route/v1/driving/${locString}?overview=full&geometries=geojson&radiuses=${unlimitedRadii}&continue_straight=false`;
      res = await fetch(fallbackUrl);
      data = res.ok ? await res.json() : null;
    }

    if (data && data.code === "Ok" && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const coordinates: [number, number][] = route.geometry.coordinates;
      const distanceMi = route.distance * 0.000621371;
      const durationSec = route.duration;

      const rawLegs = route.legs || [];
      const legs: LegMetric[] = [];
      const expectedLegsCount = locations.length - 1;

      for (let i = 0; i < expectedLegsCount; i++) {
        if (rawLegs[i] && typeof rawLegs[i].distance === "number" && rawLegs[i].distance > 0) {
          legs.push({
            distanceMi: rawLegs[i].distance * 0.000621371,
            durationSec: rawLegs[i].duration
          });
        } else {
          const start = locations[i];
          const end = locations[i + 1];
          const legDist = haversineDistance(start.lat, start.lon, end.lat, end.lon);
          const legDur = (legDist / 50) * 3600;
          legs.push({ distanceMi: legDist, durationSec: legDur });
        }
      }

      return { coordinates, distanceMi, durationSec, legs };
    }
  } catch (err) {
    console.warn("Batch OSRM fetch failed, using geodesic segment:", err);
  }

  return generateGeodesicFallback(locations);
}

/**
 * Main Infinite Routing Engine Fetcher:
 * Automatically batches locations into chunks of 25 to support unlimited waypoints
 */
export async function fetchExpeditionRoute(locations: RouteLocation[]): Promise<RouteResult> {
  if (locations.length < 2) {
    return { coordinates: [], distanceMi: 0, durationSec: 0, legs: [] };
  }

  const MAX_BATCH_SIZE = 25;

  if (locations.length <= MAX_BATCH_SIZE) {
    return fetchSingleBatchRoute(locations);
  }

  console.log(`Unlimited Batch Routing: Splitting ${locations.length} waypoints into batches of ${MAX_BATCH_SIZE}...`);
  const batches: RouteLocation[][] = [];
  let index = 0;

  while (index < locations.length - 1) {
    const end = Math.min(index + MAX_BATCH_SIZE, locations.length);
    batches.push(locations.slice(index, end));
    index = end - 1;
  }

  const results = await Promise.all(batches.map((batch) => fetchSingleBatchRoute(batch)));

  const combinedCoordinates: [number, number][] = [];
  let totalDistanceMi = 0;
  let totalDurationSec = 0;
  const combinedLegs: LegMetric[] = [];

  results.forEach((res, idx) => {
    totalDistanceMi += res.distanceMi;
    totalDurationSec += res.durationSec;
    combinedLegs.push(...res.legs);

    if (idx === 0) {
      combinedCoordinates.push(...res.coordinates);
    } else {
      combinedCoordinates.push(...res.coordinates.slice(1));
    }
  });

  return {
    coordinates: combinedCoordinates,
    distanceMi: totalDistanceMi,
    durationSec: totalDurationSec,
    legs: combinedLegs
  };
}
