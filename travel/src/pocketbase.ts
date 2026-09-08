import PocketBase from "pocketbase";
import { Trip } from "./types/trip";

export const POCKETBASE_URL = "https://api.wade-usa.com";
export const pb = new PocketBase(POCKETBASE_URL);

// Disable auto-cancellation for smooth background sync
pb.autoCancellation(false);

/**
 * PocketBase Record Schema mapping for `travel` collection
 */
export interface PBTripRecord {
  id?: string;
  slug: string;
  title: string;
  subtitle?: string;
  destination: string;
  dates: string;
  status: string;
  coverEmoji: string;
  coverGradient: string;
  summary: string;
  stats: any;
  schedule: any;
  reservations: any;
  packingList: any;
  notes: any;
  created?: string;
  updated?: string;
}

/**
 * Map PocketBase DB record to Trip domain model
 */
export function mapPBRecordToTrip(record: any): Trip {
  return {
    id: record.id || `pb-${record.slug}`,
    slug: record.slug,
    title: record.title || "Untitled Travel Plan",
    subtitle: record.subtitle || "",
    destination: record.destination || "Destination TBD",
    dates: record.dates || "Dates TBD",
    status: (record.status as any) || "active",
    coverEmoji: record.coverEmoji || "✈️",
    coverGradient: record.coverGradient || "linear-gradient(135deg, #06b6d4, #3b82f6)",
    summary: record.summary || "",
    stats: typeof record.stats === "string" ? parseJsonSafely(record.stats) : (record.stats || {}),
    schedule: typeof record.schedule === "string" ? parseJsonSafely(record.schedule) : (record.schedule || []),
    reservations: typeof record.reservations === "string" ? parseJsonSafely(record.reservations) : (record.reservations || []),
    packingList: typeof record.packingList === "string" ? parseJsonSafely(record.packingList) : (record.packingList || []),
    notes: typeof record.notes === "string" ? parseJsonSafely(record.notes) : (record.notes || [])
  };
}

function parseJsonSafely(str: string): any {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

/**
 * Map Trip domain model to PocketBase DB record format
 */
export function mapTripToPBRecord(trip: Trip): PBTripRecord {
  return {
    slug: trip.slug,
    title: trip.title,
    subtitle: trip.subtitle || "",
    destination: trip.destination,
    dates: trip.dates,
    status: trip.status,
    coverEmoji: trip.coverEmoji,
    coverGradient: trip.coverGradient,
    summary: trip.summary,
    stats: trip.stats || {},
    schedule: trip.schedule || [],
    reservations: trip.reservations || [],
    packingList: trip.packingList || [],
    notes: trip.notes || []
  };
}

/**
 * Fetch all travel itineraries strictly from PocketBase DB (`travel` collection)
 */
export async function fetchTripsFromPB(): Promise<{ trips: Trip[]; isForbidden?: boolean }> {
  try {
    const records = await pb.collection("travel").getFullList({
      sort: "-created"
    });
    if (records) {
      return { trips: records.map(mapPBRecordToTrip) };
    }
  } catch (err: any) {
    if (err.status === 403) {
      console.warn("🔒 PocketBase 403 Forbidden: API Rules for 'travel' collection are locked to Admin Only in PocketBase Admin UI (https://api.wade-usa.com/_/).");
      return { trips: [], isForbidden: true };
    }
    console.warn("PocketBase fetch travel warning:", err.message);
  }
  return { trips: [] };
}

/**
 * Fetch a single travel itinerary by URL slug strictly from PocketBase DB (`travel` collection)
 */
export async function fetchTripBySlugFromPB(slug: string): Promise<Trip | null> {
  try {
    const record = await pb.collection("travel").getFirstListItem(`slug = "${slug}"`);
    if (record) {
      return mapPBRecordToTrip(record);
    }
  } catch (err: any) {
    console.warn(`PocketBase fetch travel by slug "${slug}" warning:`, err.message);
  }
  return null;
}

/**
 * Save or update travel itinerary strictly in PocketBase DB (`travel` collection)
 */
export async function saveTripToPB(trip: Trip): Promise<Trip | null> {
  const payload = mapTripToPBRecord(trip);
  try {
    let existingRecord = null;
    try {
      existingRecord = await pb.collection("travel").getFirstListItem(`slug = "${trip.slug}"`);
    } catch (_) {}

    let saved = null;
    if (existingRecord) {
      saved = await pb.collection("travel").update(existingRecord.id, payload);
    } else {
      saved = await pb.collection("travel").create(payload);
    }

    if (saved) {
      return mapPBRecordToTrip(saved);
    }
  } catch (err: any) {
    console.error("Failed to save to PocketBase travel collection:", err.message);
  }
  return null;
}
