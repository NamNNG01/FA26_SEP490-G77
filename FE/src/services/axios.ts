import axios from 'axios';
import { config } from '@/config';
import { clearAuth, getAccessToken, getRefreshToken, saveTokens } from '@/auth/storage';
import { emitSessionExpired } from '@/auth/sessionExpired';

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
 * register, login, refresh: permitAll (no token required — SecurityConfig).
 * logout / logout-all: PROTECTED (require a Bearer token) — the backend
 *     enforces @AuthenticationPrincipal UserPrincipal on these routes.
 */
const PUBLIC_ENDPOINTS = [
  '/auth/register',
  '/auth/login',
  '/auth/refresh',
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
      const refreshToken = getRefreshToken();

      if (refreshToken) {
        try {
          // Backend contract: POST /auth/refresh with { refreshToken } in the
          // body (RefreshTokenRequest). No Authorization header needed — the
          // endpoint is permitAll. Response: ApiResponse<TokenResponse>.
          const res = await axios.post(
            `${config.apiBaseUrl}auth/refresh`,
            { refreshToken },
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

          original.headers.Authorization = `Bearer ${data.accessToken}`;
          return apiClient(original);
        } catch {
          // Refresh failed → session is dead. Clear storage and notify the
          // AuthProvider so it resets React state (no hard page reload).
          clearAuth();
          emitSessionExpired();
        }
      } else {
        clearAuth();
        emitSessionExpired();
      }
    }

    return Promise.reject(error);
  },
);
