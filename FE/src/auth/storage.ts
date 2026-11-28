import type { UserResponse } from "@/types/auth";

/**
 * Single source of truth for auth persistence.
 *
 * Keys are used by:
 *  - authContext (login / logout / session restore)
 *  - services/axios (request interceptor + refresh flow)
 *
 * IMPORTANT: never read/write auth data with a different key or a raw
 * localStorage call elsewhere — always go through this module so save,
 * read and remove stay in sync.
 */
const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";
const USER_KEY = "user";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getUser(): UserResponse | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw) as UserResponse & { role?: unknown };
    // Backward compat: sessions stored before the backend migration kept
    // role as { code, name }. Normalize to the new plain-string shape.
    if (user && typeof user.role !== "string") {
      const legacy = user.role as { code?: unknown } | null;
      const code = typeof legacy?.code === "string" ? legacy.code : "";
      return { ...user, role: code } as UserResponse;
    }
    return user as UserResponse;
  } catch {
    return null;
  }
}

export function getUserRoleCode(): string {
  return getUser()?.role ?? "";
}

export function saveAuth(params: {
  accessToken: string;
  refreshToken: string;
  user?: UserResponse | null;
}) {
  localStorage.setItem(ACCESS_TOKEN_KEY, params.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, params.refreshToken);
  if (params.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(params.user));
  }
}

/** Replace the persisted user (e.g. after PUT /users/me) without touching tokens. */
export function saveUser(user: UserResponse) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function saveTokens(params: { accessToken: string; refreshToken: string }) {
  localStorage.setItem(ACCESS_TOKEN_KEY, params.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, params.refreshToken);
}

/**
 * Notify when ANOTHER tab changes the stored session ('storage' events never
 * fire in the tab that wrote the change):
 *  - 'signedOut'   — the refresh token was removed (logout, failed refresh)
 *  - 'userChanged' — a user was written (sign-in, profile edit, account switch)
 */
export function onExternalAuthChange(
  cb: (change: "signedOut" | "userChanged") => void,
): () => void {
  function handle(e: StorageEvent) {
    if (e.storageArea !== localStorage) return;
    // key === null → localStorage.clear() in the other tab.
    if (e.key === null || (e.key === REFRESH_TOKEN_KEY && e.newValue === null)) {
      cb("signedOut");
    } else if (e.key === USER_KEY && e.newValue !== null) {
      cb("userChanged");
    }
  }
  window.addEventListener("storage", handle);
  return () => window.removeEventListener("storage", handle);
}

/**
 * Clear ONLY auth-related keys. Never `localStorage.clear()` — that would
 * wipe unrelated app data (theme, preferences, …).
 */
export function clearAuth() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
