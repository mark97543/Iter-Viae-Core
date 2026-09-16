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
  trip_template: TripTemplate;
  waypoints?: any[];
  bookings?: any[];
  sections?: any[];
  packingList?: any[];
  dayNotes?: Record<string, string>;
  coverEmoji?: string;
  coverGradient?: string;
  created?: string;
  updated?: string;
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
  const results: TripRecord[] = [];

  try {
    let records: any[] = [];
    if (user) {
      const filterQuery = `(user = "${user.id}" || shared ~ "${user.id}" || user = "guest" || user = "") && status = "${statusFilter}"`;
      records = await pb.collection("trips").getFullList<any>({
        filter: filterQuery,
        sort: "-updated,-created",
        requestKey: null,
      });
    } else {
      // Unauthenticated / Guest Mode: Fetch all active or archived trips
      records = await pb.collection("trips").getFullList<any>({
        filter: `status = "${statusFilter}"`,
        sort: "-updated,-created",
        requestKey: null,
      });
    }

    records.forEach((r) => {
      results.push({
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
        dates: r.dates || r.startDate || "",
        trip_template: r.trip_template || (r.waypoints ? "ROADTRIP" : "TRAVEL"),
        waypoints: r.waypoints || [],
        bookings: r.bookings || r.reservations || [],
        sections: r.sections || [],
        coverEmoji: r.coverEmoji || (r.trip_template === "TRAVEL" ? "✈️" : "🚗"),
        coverGradient: r.coverGradient || "linear-gradient(135deg, #0ea5e9, #3b82f6)",
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
  summary?: string;
}): Promise<TripRecord> {
  const user = getCurrentUser();
  const generatedSlug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `trip-${Date.now()}`;

  const payload: any = {
    title: data.title.trim(),
    slug: generatedSlug,
    destination: data.destination || "",
    startDate: data.startDate || "",
    endDate: data.endDate || "",
    dates: data.startDate && data.endDate ? `${data.startDate} - ${data.endDate}` : data.startDate || "TBD",
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
    const users = await pb.collection("users").getList(1, 1, {
      filter: `email = "${cleanEmail}"`
    });

    if (users.items.length === 0) {
      return { success: false, message: `No user found registered with email "${cleanEmail}".` };
    }

    const targetUser = users.items[0];
    const trip = await pb.collection("trips").getOne<TripRecord>(tripId);
    const currentShared = trip.shared || [];
    if (currentShared.includes(targetUser.id)) {
      return { success: true, message: `Trip is already shared with ${targetUser.email}.` };
    }

    const updatedShared = [...currentShared, targetUser.id];
    await pb.collection("trips").update(tripId, { shared: updatedShared });
    return { success: true, message: `Trip successfully shared with ${targetUser.name || targetUser.email}!` };
  } catch (err: any) {
    console.error("Error sharing trip:", err);
    return { success: false, message: err.message || "Failed to share trip." };
  }
}
