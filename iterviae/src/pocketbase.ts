import PocketBase from "pocketbase";

// Configure PocketBase Server Endpoint
export const POCKETBASE_URL = "https://api.wade-usa.com";

export const pb = new PocketBase(POCKETBASE_URL);

// Helper methods for Auth
export class PocketBaseAuth {
  static isAuthenticated(): boolean {
    return pb.authStore.isValid;
  }

  static getUser() {
    return pb.authStore.record;
  }

  static async login(identity: string, password: string) {
    return await pb.collection("users").authWithPassword(identity, password);
  }

  static async register(email: string, password: string, name?: string) {
    const data = {
      email,
      password,
      passwordConfirm: password,
      name: name || "Tactical User"
    };
    return await pb.collection("users").create(data);
  }

  static logout() {
    pb.authStore.clear();
  }
}
