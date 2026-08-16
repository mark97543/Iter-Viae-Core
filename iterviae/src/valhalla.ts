// Valhalla Routing Engine Integration Endpoint
export const VALHALLA_URL = "https://valhalla.wade-usa.com";

export interface RouteLocation {
  lat: number;
  lon: number;
}

export interface ValhallaRouteResponse {
  trip: {
    summary: {
      length: number; // distance in miles
      time: number;   // duration in seconds
    };
    legs: Array<{
      shape: string; // Encoded Polyline6 shape string
      summary: {
        length: number;
        time: number;
      };
    }>;
  };
}

/**
 * Decode Valhalla Polyline 6 encoded shape string into array of [longitude, latitude] coordinates.
 * Precision: 1e6 (6 decimal places)
 */
export function decodePolyline6(encoded: string): [number, number][] {
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const coordinates: [number, number][] = [];

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    // Convert from 1e6 integer format to degrees
    coordinates.push([lng / 1e6, lat / 1e6]);
  }

  return coordinates;
}

/**
 * Request turn-by-turn route geometry and metrics from Valhalla API
 */
export async function fetchValhallaRoute(
  locations: RouteLocation[],
  costing: "auto" | "motorcycle" | "bicycle" = "auto"
): Promise<{ coordinates: [number, number][]; distanceMi: number; durationSec: number }> {
  const payload = {
    locations: locations.map((loc) => ({ lat: loc.lat, lon: loc.lon })),
    costing: costing,
    directions_options: { units: "miles" }
  };

  const response = await fetch(`${VALHALLA_URL}/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Valhalla Route API error: ${response.status} ${response.statusText}`);
  }

  const data: ValhallaRouteResponse = await response.json();
  if (!data.trip || !data.trip.legs || data.trip.legs.length === 0) {
    throw new Error("No valid route returned from Valhalla.");
  }

  const allCoordinates: [number, number][] = [];

  data.trip.legs.forEach((leg) => {
    if (leg.shape) {
      const decodedLegCoords = decodePolyline6(leg.shape);
      allCoordinates.push(...decodedLegCoords);
    }
  });

  return {
    coordinates: allCoordinates,
    distanceMi: data.trip.summary.length,
    durationSec: data.trip.summary.time
  };
}
