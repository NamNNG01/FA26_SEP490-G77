import axios from 'axios';
import { config } from '@/config';
import { clearAuth, getAccessToken, getRefreshToken, saveTokens } from '@/auth/storage';
import { emitSessionExpired } from '@/auth/sessionExpired';
import { serverErrorMessage } from '@/utils/apiError';

export const apiClient = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Endpoints that never carry an Authorization header.
 *
 * register, login, google, refresh, password/forgot, password/reset: permitAll
 *     (no token required — SecurityConfig). Being public also keeps a 401
 *     "Invalid or expired reset token." out of the refresh flow below.
 * logout / logout-all: PROTECTED (require a Bearer token) — the backend
 *     enforces @AuthenticationPrincipal UserPrincipal on these routes.
 */
const PUBLIC_ENDPOINTS = [
  '/auth/register',
  '/auth/login',
  '/auth/google',
  '/auth/refresh',
  '/auth/password/forgot',
  '/auth/password/reset',
];

/**
 * Check whether the given endpoint should carry an Authorization header.
 *
 * Public endpoints (login, register, refresh) never send a Bearer token —
 * the browser does not have one yet, and the backend does not require it.
 * All other endpoints require authentication and attach the access token.
 */
function isPublicEndpoint(url: string): boolean {
  return PUBLIC_ENDPOINTS.some((publicEndpoint) => url.endsWith(publicEndpoint));
}

/**
 * Attach the access token as a Bearer token only on protected requests.
 */
apiClient.interceptors.request.use(
  (reqConfig) => {
    const token = getAccessToken();
    if (token && !isPublicEndpoint(reqConfig.url ?? '')) {
      reqConfig.headers.Authorization = `Bearer ${token}`;
    }
    return reqConfig;
  },
  (error) => Promise.reject(error),
);

/**
 * In-flight refresh shared by every request that hits a 401 at the same time.
 * The backend rotates refresh tokens, so a second parallel /auth/refresh with
 * the same token fails ("Refresh token has already been used.") and would log
 * the user out — all callers must wait on this one call instead.
 */
let refreshInFlight: Promise<string> | null = null;

/** Cross-tab lock name: only one tab at a time may rotate the shared pair. */
const REFRESH_LOCK = 'examprep-auth-refresh';

/** Run fn while holding the cross-tab refresh lock (no lock API → run as is). */
function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(REFRESH_LOCK, fn) as Promise<T>;
  }
  return fn();
}

function refreshAccessToken(refreshToken: string): Promise<string> {
  refreshInFlight ??= withRefreshLock(async () => {
    // Tabs share one token pair. If another tab rotated it while we waited for
    // the lock, our token is now used: sending it would trip the backend's
    // reuse detection, which revokes EVERY session of the user. Use the pair
    // that tab stored instead.
    const latest = getRefreshToken();
    if (!latest) throw new Error('Signed out in another tab');
    if (latest !== refreshToken) {
      const accessToken = getAccessToken();
      if (accessToken) return accessToken;
    }

    // Backend contract: POST /auth/refresh with { refreshToken } in the
    // body (RefreshTokenRequest). No Authorization header needed — the
    // endpoint is permitAll. Response: ApiResponse<TokenResponse>.
    // VITE_API_URL has no trailing slash — join with one explicitly, or
    // the call hits ".../api/v1auth/refresh" (404) and every 401 ends
    // in a silent logout.
    const res = await axios.post(
      `${config.apiBaseUrl.replace(/\/+$/, '')}/auth/refresh`,
      { refreshToken: latest },
      { timeout: 15000 },
    );
    const body = res.data as { success: boolean; data?: unknown };
    if (!body?.success || !body.data) {
      throw new Error('Refresh failed');
    }
    const data = body.data as {
      accessToken: string;
      refreshToken: string;
      tokenType: string;
      expiresIn: number;
    };

    saveTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });
    return data.accessToken;
  }).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/**
 * Handle 401 responses from protected endpoints by refreshing the token.
 *
 * Public endpoints must never enter the refresh flow: a 401 from
 * /auth/login simply means "wrong credentials" and must surface as an
 * error to the login form, not trigger a refresh/logout cascade.
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const requestUrl: string = original?.url ?? '';
    const isPublic = isPublicEndpoint(requestUrl);

    if (error.response?.status === 401 && original && !original._retry && !isPublic) {
      original._retry = true;
      const hadSession = Boolean(getAccessToken() || getRefreshToken());
      const refreshToken = getRefreshToken();

      if (refreshToken) {
        try {
          const accessToken = await refreshAccessToken(refreshToken);
          original.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(original);
        } catch {
          clearAuth();
          if (hadSession) emitSessionExpired();
        }
      } else {
        clearAuth();
        if (hadSession) emitSessionExpired();
      }
    }

    // Surface the backend's ApiResponse.message (e.g. "Email is already
    // registered.") instead of Axios' generic "Request failed with status
    // code 4xx". The error stays an AxiosError, so .response is still there.
    // A failed @Valid only says "Validation failed…"; show which fields failed instead.
    const serverMessage = serverErrorMessage(error.response?.data);
    if (typeof serverMessage === 'string' && serverMessage.trim()) {
      error.message = serverMessage;
    }

    return Promise.reject(error);
  },
);
