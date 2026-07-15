import { create } from "zustand";

/**
 * Client-side identity store for the currently authenticated user.
 *
 * This is **client state** (not server state) — it reflects whatever
 * identity source the app layer provides (auth session, guest UUID, etc.).
 * It does NOT duplicate server data; it is the authoritative source for
 * "who the current user is" on the client.
 *
 * Apps must call `setUserIdentity()` during boot (e.g. in providers)
 * before any hooks that depend on `userId` run.
 */
interface IdentityStore {
  /** The authenticated user ID, or null before identity is resolved. */
  userId: string | null;

  /** Tracks whether app boot has resolved the client identity yet. */
  isResolved: boolean;

  /**
   * Set the current user identity. Called once during app boot by the
   * platform-specific auth wiring (apps/web, apps/mobile, etc.).
   * Marks identity resolution complete for hooks that need to distinguish
   * "not loaded yet" from "loaded with no user".
   */
  setUserIdentity: (userId: string) => void;
}

/** Stores the current app-provided user identity for API and cache scoping. */
export const useIdentityStore = create<IdentityStore>((set) => ({
  userId: null,
  isResolved: false,
  setUserIdentity: (userId) => set({ userId, isResolved: true }),
}));
