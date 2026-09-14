import PocketBase from "pocketbase";

const POCKETBASE_URL = "https://api.wade-usa.com";

export const pb = new PocketBase(POCKETBASE_URL);

pb.autoCancellation(false);

export interface SavedTripRecord {
  id: string;
  user: string;
  shared?: string[];
  trip?: string;
  title?: string;
  status?: string;
  summary?: string;
  waypoints?: any[];
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

export function isUserVerified(): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  return Boolean(user.verified);
}

export async function refreshVerificationStatus(): Promise<boolean> {
  const user = getCurrentUser();
  if (!user || !pb.authStore.token) return false;
  try {
    const updatedUser = await pb.collection("users").getOne(user.id, { requestKey: null });
    pb.authStore.save(pb.authStore.token, updatedUser);
    return Boolean(updatedUser.verified);
  } catch (err) {
    console.warn("Failed to refresh verification status:", err);
    return Boolean(user.verified);
  }
}

export async function loginUser(email: string, pass: string) {
  const identity = (email || "").trim();
  if (!identity || !pass) {
    throw new Error("Email or username and password are required.");
  }
  try {
    return await pb.collection("users").authWithPassword(identity, pass);
  } catch (err: any) {
    console.error("PocketBase auth error:", err);
    if (err?.status === 400) {
      throw new Error("Invalid email or password. If you don't have an account yet, click 'Need an account? Create one here'.");
    }
    throw new Error(err?.message || "Authentication failed.");
  }
}

export async function resolveUserIds(inputs: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const raw of inputs) {
    const clean = raw.trim();
    if (!clean) continue;
    
    // If it already looks like a PocketBase 15-char record ID
    if (/^[a-z0-9]{15}$/i.test(clean)) {
      ids.push(clean);
      continue;
    }

    try {
      const userRec = await pb.collection("users").getFirstListItem(`email = "${clean}" || username = "${clean}"`, { requestKey: null });
      if (userRec && userRec.id) {
        ids.push(userRec.id);
        continue;
      }
    } catch (_) {}

    // Fallback to raw string if user lookup doesn't find a record
    ids.push(clean);
  }
  return ids;
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const clean = (username || "").trim().toLowerCase();
  if (!clean) return true;
  try {
    const found = await pb.collection("users").getFirstListItem(`username = "${clean}"`, { requestKey: null });
    return !found;
  } catch (_) {
    return true; // 404 means available
  }
}

export async function registerUser(email: string, pass: string, name?: string, username?: string, vehicleType?: string) {
  if (!email || !pass) {
    throw new Error("Email and password are required.");
  }
  if (pass.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  const basePayload: Record<string, any> = {
    email: email.trim(),
    password: pass,
    passwordConfirm: pass,
    emailVisibility: true
  };
  if (name && name.trim()) {
    basePayload.name = name.trim();
  }
  if (username && username.trim()) {
    const cleanUsername = username.trim().toLowerCase();
    // Check availability client-side first for immediate feedback
    const available = await isUsernameAvailable(cleanUsername);
    if (!available) {
      throw new Error(`Username "${cleanUsername}" is unavailable (not unique). Please choose a different username.`);
    }
    basePayload.username = cleanUsername;
  }

  // Attempt creation with vehicleType first, fallback if vehicleType field doesn't exist in PocketBase users schema
  try {
    if (vehicleType) {
      try {
        await pb.collection("users").create({ ...basePayload, vehicleType });
        return await loginUser(email, pass);
      } catch (err: any) {
        if (err?.data?.vehicleType || err?.status === 400) {
          await pb.collection("users").create(basePayload);
          return await loginUser(email, pass);
        }
        throw err;
      }
    } else {
      await pb.collection("users").create(basePayload);
      return await loginUser(email, pass);
    }
  } catch (err: any) {
    console.error("PocketBase registration error details:", err?.data || err);
    if (err?.data?.username) {
      const chosen = username ? `"${username.trim()}"` : "";
      throw new Error(`Username ${chosen} is unavailable (not unique). Please choose a different username.`);
    }
    if (err?.data?.email) {
      throw new Error("An account with this email address already exists. Please sign in instead.");
    }
    throw err;
  }
}

export function logoutUser() {
  pb.authStore.clear();
}

export async function fetchUserTrips(): Promise<SavedTripRecord[]> {
  if (!pb.authStore.isValid || !pb.authStore.model) return [];
  const user = pb.authStore.model;
  const userId = user.id;
  const userEmail = (user.email || "").toLowerCase().trim();
  const username = (user.username || "").toLowerCase().trim();

  try {
    let filterStr = `user = "${userId}" || shared ~ "${userId}"`;
    if (userEmail) filterStr += ` || shared ~ "${userEmail}"`;
    if (username) filterStr += ` || shared ~ "${username}"`;

    const records = await pb.collection("trips").getFullList<SavedTripRecord>({
      filter: filterStr,
      sort: "-updated",
      requestKey: null
    });
    return records;
  } catch (err) {
    console.warn("Notice fetching trips collection:", err);
    return [];
  }
}

export async function createNewTrip(tripName: string, summary: string, sharedUserInputs: string[] = []): Promise<SavedTripRecord | null> {
  if (!pb.authStore.isValid || !pb.authStore.model) return null;
  
  const resolvedSharedIds = await resolveUserIds(sharedUserInputs);

  try {
    const record = await pb.collection("trips").create<SavedTripRecord>({
      user: pb.authStore.model.id,
      trip: tripName,
      title: tripName,
      summary: summary,
      shared: resolvedSharedIds
    });
    return record;
  } catch (err: any) {
    console.error("Failed to create trip:", err);
    throw err;
  }
}

export async function deleteTripRecord(tripId: string): Promise<boolean> {
  if (!pb.authStore.isValid || !pb.authStore.model) {
    throw new Error("Authentication required to delete an expedition trip.");
  }
  try {
    await pb.collection("trips").delete(tripId);
    return true;
  } catch (err: any) {
    console.error("PocketBase delete trip error:", err);
    if (err?.status === 403 || err?.status === 404) {
      throw new Error("Permission denied: Only the owner of this trip can delete it.");
    }
    throw new Error(err?.message || "Failed to delete trip record.");
  }
}

export async function leaveSharedTripRecord(tripId: string): Promise<boolean> {
  const user = getCurrentUser();
  if (!user || !pb.authStore.isValid) {
    throw new Error("Authentication required to leave shared trip.");
  }

  try {
    const trip = await pb.collection("trips").getOne<SavedTripRecord>(tripId, { requestKey: null });
    
    const currentUserId = user.id;
    const currentUserEmail = (user.email || "").toLowerCase().trim();
    const currentUsername = (user.username || "").toLowerCase().trim();

    const remainingShared = (trip.shared || []).filter((item: any) => {
      const val = typeof item === "string" ? item.toLowerCase().trim() : (item?.id || "").toLowerCase().trim();
      return (
        val !== currentUserId.toLowerCase() &&
        val !== currentUserEmail &&
        val !== currentUsername
      );
    });

    try {
      // Try updating with remaining array and atomic subtract modifier
      await pb.collection("trips").update(
        tripId,
        {
          shared: remainingShared,
          "shared-": currentUserId
        },
        { requestKey: null }
      );
    } catch (_) {
      // Fallback to updating shared array directly
      await pb.collection("trips").update(
        tripId,
        { shared: remainingShared },
        { requestKey: null }
      );
    }

    return true;
  } catch (err: any) {
    console.error("Failed to leave shared trip error details:", err?.data || err);
    if (err?.status === 403) {
      throw new Error("Permission denied by PocketBase Update Rule. Please ensure 'trips' Update Rule is set to: user = @request.auth.id || shared ~ @request.auth.id");
    }
    let detail = err?.message || "Failed to remove self from shared trip.";
    if (err?.data && typeof err.data === "object") {
      const parts: string[] = [];
      for (const k of Object.keys(err.data)) {
        if (err.data[k]?.message) parts.push(`${k}: ${err.data[k].message}`);
      }
      if (parts.length > 0) detail += ` (${parts.join(", ")})`;
    }
    throw new Error(detail);
  }
}

export const deleteTrip = deleteTripRecord;


export interface WelcomeBriefingRecord {
  id?: string;
  badge?: string;
  title?: string;
  intro?: string;
  updated?: string;
}

export async function fetchWelcomeBriefingFromDB(): Promise<WelcomeBriefingRecord | null> {
  try {
    const records = await pb.collection("announcements").getList<any>(1, 1, {
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
    return null;
  } catch (err) {
    console.warn("Notice querying announcements collection:", err);
    return null;
  }
}

export function subscribeToWelcomeBriefing(onChange: (data: WelcomeBriefingRecord) => void): () => void {
  try {
    pb.collection("announcements").subscribe("*", (e) => {
      if (e.record) {
        onChange({
          id: e.record.id,
          badge: e.record.badge || "👋 WELCOME TO ITER VIAE",
          title: e.record.title || e.record.heading || "WELCOME TO ITER VIAE",
          intro: e.record.intro || e.record.summary || e.record.body || e.record.description,
          updated: e.record.updated || e.record.created
        });
      }
    }).catch(err => {
      console.warn("Real-time subscription notice:", err);
    });

    return () => {
      pb.collection("announcements").unsubscribe("*").catch(() => {});
    };
  } catch (err) {
    console.warn("Could not subscribe to announcements:", err);
    return () => {};
  }
}

