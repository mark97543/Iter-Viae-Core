export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistance(miles: number): string {
  if (miles < 0.1) return `${Math.round(miles * 5280)} FT`;
  return `${miles.toFixed(1)} MI`;
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}H ${minutes}M`;
  }
  return `${minutes}M`;
}

export async function fetchExpeditionRoute(locations: Array<{ lat: number; lon: number }>) {
  if (locations.length < 2) return null;

  const body = {
    locations: locations.map((loc) => ({ lat: loc.lat, lon: loc.lon })),
    costing: "auto",
    units: "miles"
  };

  try {
    const res = await fetch("https://valhalla1.openstreetmap.de/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      throw new Error(`Valhalla API error: ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.warn("Failed to fetch Valhalla route, falling back to straight lines:", err);
    return null;
  }
}
