import { Trip } from "../types/trip";

// Strict DB mode: return empty array so trips are fetched solely from PocketBase DB
export function loadLocalFolderTrips(): Trip[] {
  return [];
}
