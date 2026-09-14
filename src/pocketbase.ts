import PocketBase from "pocketbase";

const POCKETBASE_URL = "https://api.wade-usa.com";

export const pb = new PocketBase(POCKETBASE_URL);

pb.autoCancellation(false);

export interface SavedTripRecord {
  id: string;
  user: string;
  title: string;
  status?: string;
  summary?: string;
  waypoints: any[];
  metrics?: any;
  created?: string;
  updated?: string;
}

export function isUserAuthenticated(): boolean {
  return pb.authStore.isValid;
}

export function getCurrentUser() {
  return pb.authStore.model;
}

export async function loginUser(email: string, pass: string) {
  return await pb.collection("users").authWithPassword(email, pass);
}

export async function registerUser(email: string, pass: string, name?: string, vehicleType?: string) {
  await pb.collection("users").create({
    email,
    password: pass,
    passwordConfirm: pass,
    name: name || "",
    vehicleType: vehicleType || "motorcycle"
  });
  return await loginUser(email, pass);
}

export function logoutUser() {
  pb.authStore.clear();
}

export async function fetchUserTrips(): Promise<SavedTripRecord[]> {
  if (!pb.authStore.isValid || !pb.authStore.model) return [];
  try {
    const records = await pb.collection("trips").getFullList<SavedTripRecord>({
      filter: `user = "${pb.authStore.model.id}"`,
      sort: "-updated",
      requestKey: null
    });
    return records;
  } catch (err) {
    console.warn("Failed to fetch trips:", err);
    return [];
  }
}

export interface WelcomeBriefingRecord {
  id?: string;
  badge?: string;
  title?: string;
  intro?: string;
  updated?: string;
}

export async function fetchWelcomeBriefingFromDB(): Promise<WelcomeBriefingRecord | null> {
  try {
    const collections = ["announcements", "settings", "content", "trips"];
    for (const col of collections) {
      try {
        const records = await pb.collection(col).getList<any>(1, 1, {
          sort: "-updated",
          requestKey: null
        });
        if (records.items.length > 0) {
          const item = records.items[0];
          return {
            id: item.id,
            badge: item.badge || "👋 WELCOME TO ITER VIAE",
            title: item.title || item.heading || "WELCOME TO ITER VIAE",
            intro: item.intro || item.summary || item.body || item.description,
            updated: item.updated || item.created
          };
        }
      } catch (_) {}
    }
    return null;
  } catch (err) {
    console.warn("Failed to fetch welcome briefing from DB:", err);
    return null;
  }
}
