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
  packingList?: any[];
  dayNotes?: Record<string, string>;
  coverEmoji?: string;
  coverGradient?: string;
  created?: string;
  updated?: string;
}

// Local Storage Fallback DB helpers (used when server collection doesn't exist / returns 404)
const LOCAL_DB_KEY = "wade_usa_trips_local_db";

function getLocalTrips(): TripRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_DB_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLocalTrips(trips: TripRecord[]) {
  try {
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(trips));
  } catch (e) {}
}

// Single Sign-On (SSO) URL generator
export function getSpokeAppUrl(app: "road" | "travel", tripId?: string): string {
  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  let baseUrl = "";

  if (isLocal) {
    baseUrl = app === "road" ? "http://localhost:5173/" : "http://localhost:3001/";
  } else {
    baseUrl = app === "road" ? "https://road.wade-usa.com/" : "https://travel.wade-usa.com/";
  }

  const params = new URLSearchParams();
  if (tripId) params.set("tripId", tripId);
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

// User-Locked Trip Database API with 404 Graceful Fallback
export async function fetchUserTrips(statusFilter: "active" | "archived" = "active"): Promise<TripRecord[]> {
  const user = getCurrentUser();
  if (!user) return [];

  const results: TripRecord[] = [];
  const filterQuery = `(user = "${user.id}" || shared ~ "${user.id}") && status = "${statusFilter}"`;

  try {
    const records = await pb.collection("trips").getFullList<any>({
      filter: filterQuery,
      sort: "-updated,-created",
      requestKey: null,
    });
    records.forEach((r) => {
      results.push({
        id: r.id,
        user: r.user || user.id,
        shared: r.shared || [],
        title: r.title || r.name || "Untitled Trip",
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
        coverEmoji: r.coverEmoji || (r.trip_template === "TRAVEL" ? "✈️" : "🚗"),
        coverGradient: r.coverGradient || "linear-gradient(135deg, #0ea5e9, #3b82f6)",
        created: r.created,
        updated: r.updated,
      });
    });
    return results;
  } catch (err: any) {
    if (err?.status === 404) {
      console.warn("PocketBase 'trips' collection not on server (404). Loading local fallback DB.");
    }
  }

  // Fallback to local trips DB if 404 or offline
  const localTrips = getLocalTrips();
  return localTrips.filter((t) => (t.user === user.id || (t.shared || []).includes(user.id)) && (t.status || "active") === statusFilter);
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
  if (!user) {
    throw new Error("Must be logged in to create a trip.");
  }

  const payload: any = {
    user: user.id,
    shared: [],
    title: data.title.trim(),
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
    bookings: data.trip_template === "TRAVEL" ? [
      { id: "book-1", type: "flight", title: "Dummy Flight Booking", locationOrConfirmation: "CONF-DUMMY123", notes: "Placeholder travel booking" }
    ] : [],
    dayNotes: data.trip_template === "TRAVEL" ? { "1": "<h3>Day 1 - Travel Staging</h3><p>Dummy travel itinerary placeholder...</p>" } : {},
    coverEmoji: data.trip_template === "ROADTRIP" ? "🚗" : "✈️",
    coverGradient: data.trip_template === "ROADTRIP" ? "linear-gradient(135deg, #0ea5e9, #3b82f6)" : "linear-gradient(135deg, #06b6d4, #8b5cf6)",
  };

  try {
    const record = await pb.collection("trips").create(payload);
    return { ...payload, id: record.id };
  } catch (err: any) {
    console.warn("Server collection 'trips' returned error/404. Creating trip in fallback local DB.");
    const localTrips = getLocalTrips();
    const newRecord: TripRecord = { ...payload, id: "trip_" + Date.now(), created: new Date().toISOString() };
    localTrips.unshift(newRecord);
    saveLocalTrips(localTrips);
    return newRecord;
  }
}

export async function archiveTripRecord(tripId: string): Promise<any> {
  try {
    return await pb.collection("trips").update(tripId, { status: "archived" });
  } catch (err) {
    const localTrips = getLocalTrips();
    const item = localTrips.find((t) => t.id === tripId);
    if (item) item.status = "archived";
    saveLocalTrips(localTrips);
  }
}

export async function unarchiveTripRecord(tripId: string): Promise<any> {
  try {
    return await pb.collection("trips").update(tripId, { status: "active" });
  } catch (err) {
    const localTrips = getLocalTrips();
    const item = localTrips.find((t) => t.id === tripId);
    if (item) item.status = "active";
    saveLocalTrips(localTrips);
  }
}

export async function deleteTripRecord(tripId: string): Promise<boolean> {
  try {
    await pb.collection("trips").delete(tripId);
  } catch (err) {}
  
  const localTrips = getLocalTrips().filter((t) => t.id !== tripId);
  saveLocalTrips(localTrips);
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

    try {
      const trip = await pb.collection("trips").getOne<TripRecord>(tripId);
      const currentShared = trip.shared || [];
      if (currentShared.includes(targetUser.id)) {
        return { success: true, message: `Trip is already shared with ${targetUser.email}.` };
      }

      const updatedShared = [...currentShared, targetUser.id];
      await pb.collection("trips").update(tripId, { shared: updatedShared });
    } catch (err) {
      // Local DB fallback for sharing
      const localTrips = getLocalTrips();
      const item = localTrips.find((t) => t.id === tripId);
      if (item) {
        if (!item.shared) item.shared = [];
        if (!item.shared.includes(targetUser.id)) item.shared.push(targetUser.id);
        saveLocalTrips(localTrips);
      }
    }

    return { success: true, message: `Trip successfully shared with ${targetUser.name || targetUser.email}!` };
  } catch (err: any) {
    console.error("Error sharing trip:", err);
    return { success: false, message: err.message || "Failed to share trip." };
  }
}
