import PocketBase from "pocketbase";

export const POCKETBASE_URL = "https://api.wade-usa.com";
export const pb = new PocketBase(POCKETBASE_URL);
pb.autoCancellation(false);

export type TripTemplate = "ROADTRIP" | "TRAVEL";

export interface TripRecord {
  id: string;
  user: string;
  shared?: string[];
  title: string;
  slug?: string;
  subtitle?: string;
  status: "active" | "archived";
  summary?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  dates?: string;
  budget?: number;
  days?: number;
  distance?: number | string;
  distanceMi?: number;
  metrics?: any;
  stats?: any;
  trip_template: TripTemplate;
  waypoints?: any[];
  bookings?: any[];
  sections?: any[];
  packingList?: any[];
  schedule?: any[];
  dayNotes?: Record<string, string>;
  coverEmoji?: string;
  coverGradient?: string;
  created?: string;
  updated?: string;
  [key: string]: any;
}


// Single Sign-On (SSO) URL generator
export function getSpokeAppUrl(app: "road" | "travel", tripId?: string, slug?: string): string {
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  let baseUrl = "";

  if (isLocal) {
    baseUrl = app === "road" ? "http://localhost:5173/" : "http://localhost:3001/";
  } else {
    baseUrl = app === "road" ? "https://road.wade-usa.com/" : "https://travel.wade-usa.com/";
  }

  const params = new URLSearchParams();
  if (tripId) params.set("tripId", tripId);
  if (slug) params.set("slug", slug);
  if (pb.authStore.isValid && pb.authStore.token) {
    params.set("token", pb.authStore.token);
  }

  const q = params.toString();
  return q ? `${baseUrl}?${q}` : baseUrl;
}

// Auth Helpers
export function isUserAuthenticated(): boolean {
  return pb.authStore.isValid;
}

export function getCurrentUser() {
  return pb.authStore.model;
}

export function isUserVerified(): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  return Boolean(user.verified);
}

export async function refreshVerificationStatus(): Promise<boolean> {
  const user = getCurrentUser();
  if (!user || !pb.authStore.token) return false;
  try {
    const authData = await pb.collection("users").authRefresh();
    const updatedUser = authData.record;
    pb.authStore.save(pb.authStore.token, updatedUser);
    return Boolean(updatedUser.verified);
  } catch (e) {
    return Boolean(user.verified);
  }
}

export async function loginUser(email: string, pass: string) {
  const identity = (email || "").trim();
  if (!identity || !pass) {
    throw new Error("Email/username and password are required.");
  }
  return await pb.collection("users").authWithPassword(identity, pass);
}

export async function registerUser(email: string, pass: string, name?: string) {
  const cleanEmail = (email || "").trim();
  if (!cleanEmail || !pass) {
    throw new Error("Email and password are required.");
  }
  const username = cleanEmail.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "") + "_" + Math.floor(Math.random() * 1000);
  const created = await pb.collection("users").create({
    email: cleanEmail,
    emailVisibility: true,
    password: pass,
    passwordConfirm: pass,
    name: name || username,
    username: username,
  });

  await pb.collection("users").authWithPassword(cleanEmail, pass);
  return created;
}

export function logoutUser() {
  pb.authStore.clear();
}

// User-Locked & Guest Trip Database API (Strictly PocketBase DB)
export async function fetchUserTrips(statusFilter: "active" | "archived" = "active"): Promise<TripRecord[]> {
  const user = getCurrentUser();
  if (!user || !pb.authStore.isValid) {
    return [];
  }
  const results: TripRecord[] = [];

  try {
    const userId = user.id;
    const userEmail = (user.email || "").toLowerCase().trim();
    const username = (user.username || "").toLowerCase().trim();

    let filterQuery = `(user = "${userId}" || shared ~ "${userId}"`;
    if (userEmail) filterQuery += ` || shared ~ "${userEmail}"`;
    if (username) filterQuery += ` || shared ~ "${username}"`;
    filterQuery += ` || user = "guest" || user = "") && status = "${statusFilter}"`;

    const records = await pb.collection("trips").getFullList<any>({
      filter: filterQuery,
      sort: "-updated,-created",
      requestKey: null,
    });

    records.forEach((r) => {
      const isRoad = r.trip_template === "ROADTRIP" || Boolean(r.waypoints && r.waypoints.length > 0);
      results.push({
        ...r,
        id: r.id,
        user: r.user || "guest",
        shared: r.shared || [],
        title: r.title || r.name || "Untitled Trip",
        slug: r.slug || r.id,
        subtitle: r.subtitle || "",
        status: (r.status as any) || "active",
        summary: r.summary || "",
        destination: r.destination || "",
        startDate: r.startDate || "",
        endDate: r.endDate || "",
        dates: r.dates || (r.startDate && r.endDate ? `${r.startDate} - ${r.endDate}` : r.startDate || ""),
        budget: typeof r.budget === "number" ? r.budget : (r.stats?.budget || r.metrics?.budget || 0),
        stats: typeof r.stats === "object" && r.stats !== null ? r.stats : {},
        metrics: typeof r.metrics === "object" && r.metrics !== null ? r.metrics : {},
        schedule: Array.isArray(r.schedule) ? r.schedule : [],
        trip_template: (r.trip_template || (isRoad ? "ROADTRIP" : "TRAVEL")) as TripTemplate,
        waypoints: Array.isArray(r.waypoints) ? r.waypoints : [],
        bookings: Array.isArray(r.bookings) ? r.bookings : (Array.isArray(r.reservations) ? r.reservations : []),
        sections: Array.isArray(r.sections) ? r.sections : [],
        coverEmoji: r.coverEmoji || (isRoad ? "🚗" : "✈️"),
        coverGradient: r.coverGradient || (isRoad ? "linear-gradient(135deg, #0ea5e9, #3b82f6)" : "linear-gradient(135deg, #06b6d4, #8b5cf6)"),
        created: r.created,
        updated: r.updated,
      });
    });

    return results;
  } catch (err: any) {
    console.warn("PocketBase fetchUserTrips error:", err?.message || err);
    return [];
  }
}

export async function createTripRecord(data: {
  title: string;
  trip_template: TripTemplate;
  destination?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  summary?: string;
}): Promise<TripRecord> {
  const user = getCurrentUser();
  const generatedSlug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `trip-${Date.now()}`;

  let calculatedDays = 1;
  if (data.startDate && data.endDate) {
    const d1 = new Date(data.startDate);
    const d2 = new Date(data.endDate);
    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
      calculatedDays = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1);
    }
  }

  const budgetNum = typeof data.budget === "number" && !isNaN(data.budget) ? Math.max(0, data.budget) : 0;

  const payload: any = {
    title: data.title.trim(),
    slug: generatedSlug,
    destination: data.destination || "",
    startDate: data.startDate || "",
    endDate: data.endDate || "",
    dates: data.startDate && data.endDate ? `${data.startDate} - ${data.endDate}` : data.startDate || "TBD",
    budget: budgetNum,
    stats: {
      days: calculatedDays,
      budget: budgetNum
    },
    summary: data.summary || "",
    status: "active",
    trip_template: data.trip_template,
    waypoints: data.trip_template === "ROADTRIP" ? [
      { id: "wp-1", title: "Start Origin", lat: 39.8283, lon: -98.5795, type: "origin" },
      { id: "wp-2", title: "Final Destination", lat: 36.1699, lon: -115.1398, type: "destination" }
    ] : [],
    bookings: [],
    sections: [],
    dayNotes: {},
    coverEmoji: data.trip_template === "ROADTRIP" ? "🚗" : "✈️",
    coverGradient: data.trip_template === "ROADTRIP" ? "linear-gradient(135deg, #0ea5e9, #3b82f6)" : "linear-gradient(135deg, #06b6d4, #8b5cf6)",
  };

  if (user?.id) {
    payload.user = user.id;
  }

  const record = await pb.collection("trips").create(payload);
  return { ...payload, id: record.id, slug: record.slug || generatedSlug };
}

/**
 * Calculate Haversine distance in miles between two coordinates
 */
export function haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get total distance in miles for a trip (primarily Road Trips)
 */
export function getTripDistanceMiles(trip: TripRecord): number {
  if (trip.trip_template !== "ROADTRIP") return 0;

  // Direct distance fields
  if (typeof trip.distanceMi === "number" && !isNaN(trip.distanceMi) && trip.distanceMi > 0) {
    return trip.distanceMi;
  }
  if (typeof trip.distance === "number" && !isNaN(trip.distance) && trip.distance > 0) {
    return trip.distance;
  }
  if (typeof trip.distance === "string") {
    const parsed = parseFloat(trip.distance.replace(/,/g, ""));
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // From metrics object
  if (trip.metrics) {
    if (typeof trip.metrics.distanceMi === "number" && trip.metrics.distanceMi > 0) {
      return trip.metrics.distanceMi;
    }
    if (typeof trip.metrics.totalDistance === "number" && trip.metrics.totalDistance > 0) {
      return trip.metrics.totalDistance;
    }
    if (typeof trip.metrics.distance === "number" && trip.metrics.distance > 0) {
      return trip.metrics.distance;
    }
    if (typeof trip.metrics.distance === "string") {
      const parsed = parseFloat(trip.metrics.distance.replace(/,/g, ""));
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    if (Array.isArray(trip.metrics.legMetrics) && trip.metrics.legMetrics.length > 0) {
      const sum = trip.metrics.legMetrics.reduce((acc: number, leg: any) => acc + (Number(leg?.distanceMi) || 0), 0);
      if (sum > 0) return sum;
    }
    if (Array.isArray(trip.metrics.routeLegs) && trip.metrics.routeLegs.length > 0) {
      const sum = trip.metrics.routeLegs.reduce((acc: number, leg: any) => acc + (Number(leg?.distanceMi) || 0), 0);
      if (sum > 0) return sum;
    }
  }

  // Fallback: Haversine distance from waypoints
  if (Array.isArray(trip.waypoints) && trip.waypoints.length >= 2) {
    const validWps = trip.waypoints.filter(
      (wp) => wp && typeof wp.lat === "number" && typeof wp.lon === "number" && !isNaN(wp.lat) && !isNaN(wp.lon)
    );
    if (validWps.length >= 2) {
      let straightDist = 0;
      for (let i = 0; i < validWps.length - 1; i++) {
        straightDist += haversineDistanceMiles(validWps[i].lat, validWps[i].lon, validWps[i + 1].lat, validWps[i + 1].lon);
      }
      // Typical overland road multiplier ~1.2x straight line
      return Math.round(straightDist * 1.2 * 10) / 10;
    }
  }

  return 0;
}

/**
 * Get total budget for a trip
 */
export function getTripBudget(trip: TripRecord): number {
  if (trip.budget !== undefined && trip.budget !== null && !isNaN(Number(trip.budget))) {
    const b = Number(trip.budget);
    if (b > 0) return b;
  }
  if (trip.stats && trip.stats.budget !== undefined && !isNaN(Number(trip.stats.budget))) {
    const b = Number(trip.stats.budget);
    if (b > 0) return b;
  }
  if (trip.metrics && trip.metrics.budget !== undefined && !isNaN(Number(trip.metrics.budget))) {
    const b = Number(trip.metrics.budget);
    if (b > 0) return b;
  }

  // Sum from waypoints if available
  if (Array.isArray(trip.waypoints) && trip.waypoints.length > 0) {
    const sum = trip.waypoints.reduce((acc: number, wp: any) => acc + (Number(wp?.budget) || 0), 0);
    if (sum > 0) return sum;
  }

  // Sum from reservations / bookings if available
  if (Array.isArray(trip.bookings) && trip.bookings.length > 0) {
    const sum = trip.bookings.reduce((acc: number, b: any) => acc + (parseFloat(String(b?.cost || b?.price || 0).replace(/[^0-9.]/g, "")) || 0), 0);
    if (sum > 0) return sum;
  }

  return 0;
}

/**
 * Get number of days for a trip
 */
export function getTripDays(trip: TripRecord): number {
  // Explicit days field
  if (trip.days && typeof trip.days === "number" && trip.days > 0) {
    return trip.days;
  }
  if (trip.stats?.days && typeof trip.stats.days === "number" && trip.stats.days > 0) {
    return trip.stats.days;
  }

  // From startDate and endDate
  if (trip.startDate && trip.endDate) {
    const s = new Date(trip.startDate);
    const e = new Date(trip.endDate);
    if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
      const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      if (diff > 0) return diff;
    }
  }

  // From dates string if formatted "YYYY-MM-DD - YYYY-MM-DD"
  if (trip.dates && trip.dates.includes("-") && trip.dates.includes(" ")) {
    const parts = trip.dates.split(" - ");
    if (parts.length === 2) {
      const s = new Date(parts[0].trim());
      const e = new Date(parts[1].trim());
      if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
        const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (diff > 0) return diff;
      }
    }
  }

  // From travel plan schedule
  if (Array.isArray(trip.schedule) && trip.schedule.length > 0) {
    return trip.schedule.length;
  }

  // From road trip waypoints overnight count
  if (Array.isArray(trip.waypoints) && trip.waypoints.length > 0) {
    const overnights = trip.waypoints.filter((w: any) => Boolean(w?.isOvernight)).length;
    if (overnights > 0) return overnights + 1;
  }

  return 1;
}


export async function archiveTripRecord(tripId: string): Promise<any> {
  return await pb.collection("trips").update(tripId, { status: "archived" });
}

export async function unarchiveTripRecord(tripId: string): Promise<any> {
  return await pb.collection("trips").update(tripId, { status: "active" });
}

export async function deleteTripRecord(tripId: string): Promise<boolean> {
  try {
    await pb.collection("trips").delete(tripId);
  } catch (err: any) {
    console.error("Could not delete from PocketBase trips collection:", err?.message || err);
    throw err;
  }

  // Clear any legacy local storage caches
  try {
    localStorage.removeItem("wade_usa_trips_local_db");
    localStorage.removeItem("travel_pb_cache");
  } catch (e) {}

  return true;
}

// Sharing Trip by User Email
export async function shareTripByEmail(tripId: string, email: string): Promise<{ success: boolean; message: string }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!cleanEmail) return { success: false, message: "Please enter a valid email address." };

  try {
    let targetIdentifier = cleanEmail;

    try {
      const users = await pb.collection("users").getList(1, 1, {
        filter: `email = "${cleanEmail}" || username = "${cleanEmail}"`,
        requestKey: null,
      });

      if (users.items.length > 0 && users.items[0].id) {
        targetIdentifier = users.items[0].id;
      }
    } catch (e) {
      console.info("User query skipped/restricted by PocketBase rules, storing email directly:", cleanEmail);
    }

    const trip = await pb.collection("trips").getOne<TripRecord>(tripId, { requestKey: null });
    const currentShared = trip.shared || [];

    if (currentShared.includes(targetIdentifier) || currentShared.includes(cleanEmail)) {
      return { success: true, message: `Trip is already shared with ${cleanEmail}.` };
    }

    const updatedShared = [...currentShared, targetIdentifier];
    await pb.collection("trips").update(tripId, { shared: updatedShared }, { requestKey: null });
    return { success: true, message: `Trip successfully shared with ${cleanEmail}!` };
  } catch (err: any) {
    console.error("Error sharing trip:", err);
    return { success: false, message: err?.message || "Failed to share trip." };
  }
}

// Unshare Trip User
export async function unshareTripUser(tripId: string, targetIdentifier: string): Promise<{ success: boolean; message: string }> {
  const cleanTarget = (targetIdentifier || "").trim().toLowerCase();
  if (!cleanTarget) return { success: false, message: "Invalid target identifier." };

  try {
    const trip = await pb.collection("trips").getOne<TripRecord>(tripId, { requestKey: null });
    const currentShared = trip.shared || [];

    const updatedShared = currentShared.filter((item: string) => {
      const itemClean = item.trim().toLowerCase();
      return itemClean !== cleanTarget;
    });

    await pb.collection("trips").update(tripId, { shared: updatedShared }, { requestKey: null });
    return { success: true, message: `Removed shared access for "${targetIdentifier}".` };
  } catch (err: any) {
    console.error("Error unsharing trip:", err);
    return { success: false, message: err?.message || "Failed to remove shared access." };
  }
}
