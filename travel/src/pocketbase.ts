import PocketBase from "pocketbase";

const POCKETBASE_URL = "https://api.wade-usa.com";

export const pb = new PocketBase(POCKETBASE_URL);

// Prevent abort signal cancellations on mobile network transitions
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

export async function loginTravelUser(email: string, pass: string) {
  return await pb.collection("users").authWithPassword(email, pass);
}

export function logoutTravelUser() {
  pb.authStore.clear();
}
