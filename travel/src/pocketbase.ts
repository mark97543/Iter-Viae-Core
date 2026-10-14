import PocketBase from "pocketbase";
import { Trip, TripBookings, FlightBooking, HotelBooking, RentalCarBooking, ActivityBooking } from "./types/trip";

export const POCKETBASE_URL = "https://api.wade-usa.com";
export const pb = new PocketBase(POCKETBASE_URL);

// Disable auto-cancellation for smooth background sync
pb.autoCancellation(false);

function parseJsonSafely(str: any): any {
  if (typeof str !== "string") return str;
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
}

/**
 * Map PocketBase DB record to Trip domain model
 */
export function mapPBRecordToTrip(record: any): Trip {
  const rawBookings = parseJsonSafely(record.bookings) || {};
  const rawReservations = parseJsonSafely(record.reservations) || [];

  const bookings: TripBookings = {
    flights: Array.isArray(rawBookings?.flights) ? rawBookings.flights : [],
    hotels: Array.isArray(rawBookings?.hotels) ? rawBookings.hotels : [],
    rentalCars: Array.isArray(rawBookings?.rentalCars)
      ? rawBookings.rentalCars
      : Array.isArray(rawBookings?.cars)
      ? rawBookings.cars
      : [],
    activities: Array.isArray(rawBookings?.activities) ? rawBookings.activities : []
  };

  // Migrate legacy reservations if bookings is empty
  if (
    bookings.flights.length === 0 &&
    bookings.hotels.length === 0 &&
    bookings.rentalCars.length === 0 &&
    bookings.activities.length === 0 &&
    Array.isArray(rawReservations) &&
    rawReservations.length > 0
  ) {
    rawReservations.forEach((r: any, idx: number) => {
      const id = "legacy-" + idx + "-" + Date.now();
      if (r.type === "flight") {
        bookings.flights.push({
          id,
          airline: r.provider || "Airline",
          flightNumber: r.title || "Flight",
          departureAirport: "",
          arrivalAirport: "",
          departureDateTime: r.dates || "",
          arrivalDateTime: "",
          confirmationCode: r.confirmationCode || "",
          notes: r.notes || r.addressOrDetails || ""
        });
      } else if (r.type === "hotel") {
        bookings.hotels.push({
          id,
          name: r.title || "Hotel",
          address: r.addressOrDetails || "",
          checkInDate: r.dates || "",
          checkOutDate: "",
          confirmationCode: r.confirmationCode || "",
          notes: r.notes || ""
        });
      } else if (r.type === "car") {
        bookings.rentalCars.push({
          id,
          provider: r.provider || r.title || "Rental Car",
          pickupLocation: r.addressOrDetails || "",
          pickupDateTime: r.dates || "",
          confirmationCode: r.confirmationCode || "",
          notes: r.notes || ""
        });
      } else {
        bookings.activities.push({
          id,
          title: r.title || "Activity",
          location: r.addressOrDetails || "",
          dateTime: r.dates || "",
          confirmationCode: r.confirmationCode || "",
          notes: r.notes || ""
        });
      }
    });
  }

  // Extract Notes (HTML string)
  let notesHtml = "";
  const rawNotes = parseJsonSafely(record.notes);
  if (typeof rawNotes === "string") {
    notesHtml = rawNotes;
  } else if (rawNotes && typeof rawNotes === "object") {
    notesHtml = rawNotes.content || rawNotes.html || "";
  } else if (Array.isArray(record.notes)) {
    notesHtml = record.notes.map((n: string) => `<p>${n}</p>`).join("");
  } else if (typeof record.notes === "string") {
    notesHtml = record.notes;
  }

  // If notes is empty, check if legacy sections exist to migrate content
  const rawSections = parseJsonSafely(record.sections) || [];
  if (!notesHtml && Array.isArray(rawSections) && rawSections.length > 0) {
    notesHtml = rawSections
      .map(
        (sec: any) =>
          `<h3>${sec.icon ? `${sec.icon} ` : ""}${sec.title || "Topic"}</h3>${sec.content || ""}`
      )
      .join("<hr/>");
  }

  const stats = parseJsonSafely(record.stats) || {};
  const totalCost = [
    ...bookings.flights,
    ...bookings.hotels,
    ...bookings.rentalCars,
    ...bookings.activities
  ].reduce((sum, b) => sum + (Number(b.cost) || 0), 0);

  const budget = typeof record.budget === "number" ? record.budget : (stats.budget || totalCost || 0);

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
    budget,
    stats: {
      ...stats,
      budget,
      totalCost
    },
    bookings,
    notes: notesHtml,
    sections: rawSections
  };
}

/**
 * Map Trip domain model to PocketBase DB record format
 */
export function mapTripToPBRecord(trip: Trip): any {
  const totalBookingsCost = [
    ...(trip.bookings?.flights || []),
    ...(trip.bookings?.hotels || []),
    ...(trip.bookings?.rentalCars || []),
    ...(trip.bookings?.activities || [])
  ].reduce((sum, b) => sum + (Number(b.cost) || 0), 0);

  const finalBudget = totalBookingsCost > 0 ? totalBookingsCost : (trip.budget || trip.stats?.budget || 0);

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
    budget: finalBudget,
    stats: {
      ...(trip.stats || {}),
      budget: finalBudget,
      totalCost: totalBookingsCost
    },
    bookings: trip.bookings || { flights: [], hotels: [], rentalCars: [], activities: [] },
    notes: { content: trip.notes || "" }, // PocketBase JSON format
    sections: trip.sections || []
  };
}

/**
 * Fetch all travel itineraries strictly from PocketBase DB (`trips` collection)
 */
export async function fetchTripsFromPB(): Promise<{ trips: Trip[]; isForbidden?: boolean }> {
  try {
    const records = await pb.collection("trips").getFullList({
      sort: "-created",
      requestKey: null
    });
    if (records) {
      return { trips: records.map(mapPBRecordToTrip) };
    }
  } catch (err: any) {
    if (err.status === 404) {
      console.info("ℹ️ PocketBase collection 'trips' not found (404) on https://api.wade-usa.com.");
      return { trips: [] };
    }
    if (err.status === 403) {
      console.warn("🔒 PocketBase 403 Forbidden: API Rules for 'trips' collection are locked in PocketBase Admin UI.");
      return { trips: [], isForbidden: true };
    }
    console.warn("PocketBase fetch trips warning:", err.message);
  }
  return { trips: [] };
}

/**
 * Fetch a single travel itinerary by URL slug strictly from PocketBase DB (`trips` collection)
 */
export async function fetchTripBySlugFromPB(slug: string): Promise<Trip | null> {
  try {
    const record = await pb.collection("trips").getFirstListItem(`slug = "${slug}"`, { requestKey: null });
    if (record) {
      return mapPBRecordToTrip(record);
    }
  } catch (err: any) {
    if (err.status !== 404) {
      console.warn(`PocketBase fetch trips by slug "${slug}" warning:`, err.message);
    }
  }
  return null;
}

/**
 * Fetch a single travel itinerary by PocketBase ID (`trips` collection)
 */
export async function fetchTripByIdFromPB(id: string): Promise<Trip | null> {
  try {
    const record = await pb.collection("trips").getOne(id, { requestKey: null });
    if (record) {
      return mapPBRecordToTrip(record);
    }
  } catch (err: any) {
    if (err.status !== 404) {
      console.warn(`PocketBase fetch trips by ID "${id}" warning:`, err.message);
    }
  }
  return null;
}

/**
 * Save or update travel itinerary strictly in PocketBase DB (`trips` collection)
 */
export async function saveTripToPB(trip: Trip): Promise<Trip | null> {
  const payload = mapTripToPBRecord(trip);
  try {
    let existingRecord = null;
    if (trip.id && !trip.id.startsWith("pb-")) {
      try {
        existingRecord = await pb.collection("trips").getOne(trip.id, { requestKey: null });
      } catch (_) {}
    }

    if (!existingRecord) {
      try {
        existingRecord = await pb.collection("trips").getFirstListItem(`slug = "${trip.slug}"`, { requestKey: null });
      } catch (_) {}
    }

    let saved = null;
    if (existingRecord) {
      saved = await pb.collection("trips").update(existingRecord.id, payload, { requestKey: null });
    } else {
      saved = await pb.collection("trips").create(payload, { requestKey: null });
    }

    if (saved) {
      return mapPBRecordToTrip(saved);
    }
  } catch (err: any) {
    console.error("Failed to save to PocketBase trips collection:", err.message, err.data);
  }
  return null;
}
