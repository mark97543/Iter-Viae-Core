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
