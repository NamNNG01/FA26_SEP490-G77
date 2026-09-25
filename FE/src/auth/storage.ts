import type { UserResponse } from './authContext';

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
const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function getUser(): UserResponse | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as UserResponse) : null;
  } catch {
    return null;
  }
}

export function getUserRoleCode(): string {
  return getUser()?.role?.code ?? '';
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

export function saveTokens(params: { accessToken: string; refreshToken: string }) {
  localStorage.setItem(ACCESS_TOKEN_KEY, params.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, params.refreshToken);
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
