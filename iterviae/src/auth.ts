// Directus Authentication & User State Service

const DIRECTUS_URL = "https://api.wade-usa.com";

export interface UserProfile {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role?: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires: number;
}

export class AuthService {
  private static STORAGE_KEY_TOKENS = "iterviae_auth_tokens";
  private static STORAGE_KEY_USER = "iterviae_user_profile";

  static getTokens(): AuthTokens | null {
    const raw = localStorage.getItem(this.STORAGE_KEY_TOKENS);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  static getUser(): UserProfile | null {
    const raw = localStorage.getItem(this.STORAGE_KEY_USER);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  static isAuthenticated(): boolean {
    return this.getTokens() !== null;
  }

  static async login(email: string, password: string): Promise<UserProfile> {
    const response = await fetch(`${DIRECTUS_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const msg = errJson.errors?.[0]?.message || "Invalid credentials or account suspended.";
      throw new Error(msg);
    }

    const data = await response.json();
    const tokens: AuthTokens = data.data;

    localStorage.setItem(this.STORAGE_KEY_TOKENS, JSON.stringify(tokens));

    // Fetch User Profile
    const user = await this.fetchUserProfile(tokens.access_token);
    localStorage.setItem(this.STORAGE_KEY_USER, JSON.stringify(user));
    return user;
  }

  static async register(email: string, password: string, firstName?: string): Promise<void> {
    const response = await fetch(`${DIRECTUS_URL}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        first_name: firstName || "Tactical User"
      })
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      const msg = errJson.errors?.[0]?.message || "Registration failed.";
      throw new Error(msg);
    }
  }

  static async fetchUserProfile(accessToken: string): Promise<UserProfile> {
    const response = await fetch(`${DIRECTUS_URL}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok) {
      throw new Error("Failed to fetch user profile.");
    }

    const data = await response.json();
    return {
      id: data.data.id,
      email: data.data.email,
      first_name: data.data.first_name,
      last_name: data.data.last_name,
      role: data.data.role
    };
  }

  static logout(): void {
    localStorage.removeItem(this.STORAGE_KEY_TOKENS);
    localStorage.removeItem(this.STORAGE_KEY_USER);
  }
}
