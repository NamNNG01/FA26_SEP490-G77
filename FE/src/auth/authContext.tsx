import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import axios from 'axios';
import { apiClient } from '@/services/axios';
import {
  clearAuth,
  getAccessToken,
  getRefreshToken,
  getUser,
  saveAuth,
  saveUser,
} from './storage';
import { onSessionExpired } from './sessionExpired';

/**
 * Backend DTO types (mirror com.examprep.dto).
 * NOTE: backend UserResponse.role is a plain role-name string
 * (users.role_name — ADMIN / COURSE_MANAGER / STUDENT), not an object.
 */
export interface UserResponse {
  userId: number; // Backend sends a numeric Long
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: string;
  status: string;
  createdAt: string; // Instant → ISO string (added with USER-01)
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: UserResponse;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface AuthState {
  user: UserResponse | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /**
   * The stored session was rejected (token revoked/expired, or the account
   * changed on the server). AppContent sends the visitor to /login while set.
   */
  reauthRequired: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<UserResponse>;
  register: (email: string, password: string, fullName: string) => Promise<UserResponse>;
  logout: () => Promise<void>;
  /** POST /auth/logout-all — revokes every session. Throws on failure. */
  logoutAll: () => Promise<void>;
  setAuth: (state: Partial<AuthState>) => void;
  /** Replace the signed-in user (state + storage), e.g. after PUT /users/me. */
  updateUser: (user: UserResponse) => void;
  /** Called once the visitor has reached /login after a forced sign-out. */
  clearReauthRequired: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Landing page per backend role name (users.role_name constants).
 */
export function landingPathForRole(roleCode: string | undefined | null): string {
  switch (roleCode) {
    case 'ADMIN':
      return '/admin/dashboard';
    case 'COURSE_MANAGER':
      return '/manager/dashboard';
    case 'STUDENT':
    default:
      return '/student/dashboard';
  }
}

/**
 * Fields that define WHO the session belongs to and WHAT it may do. If any of
 * them differs between the stored user and GET /users/me, the stored session
 * is stale and the user must sign in again. fullName / avatarUrl are display
 * data only — those are synced silently instead.
 */
function sessionStillValid(stored: UserResponse, server: UserResponse): boolean {
  return (
    stored.userId === server.userId &&
    stored.email === server.email &&
    stored.role === server.role &&
    stored.status === server.status &&
    server.status === 'ACTIVE'
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isLoading: true,
    isAuthenticated: false,
    reauthRequired: false,
  });

  // ---- Shared local cleanup for EVERY logout path -----------------------
  // Used by logout(), logoutAll(), the boot check and the session-expired
  // bridge below so tokens/user cleanup and state reset live in one place.
  // `reauthRequired` marks a forced sign-out (vs. one the user asked for).
  function clearLocalSession(reauthRequired = false) {
    clearAuth();
    setState({
      user: null,
      accessToken: null,
      isLoading: false,
      isAuthenticated: false,
      reauthRequired,
    });
  }

  // ---- Boot session on mount (persistence after page refresh) ----------
  //
  // A stored session is NOT trusted blindly: the token is verified with
  // GET /users/me (USER-01) before any route renders (isLoading stays true,
  // so AppContent shows the LoadingScreen instead of redirecting early).
  //   - 401 the interceptor cannot refresh, or another 4xx → re-login
  //   - user id / email / role / status changed on the server → re-login
  //   - only fullName / avatarUrl changed → synced silently
  //   - backend unreachable (network error, timeout, 5xx) → keep the cached
  //     session; the interceptor still catches a dead token on the next call.
  useEffect(() => {
    const accessToken = getAccessToken();
    const refreshToken = getRefreshToken();
    const storedUser = getUser();

    if (!accessToken || !refreshToken || !storedUser) {
      // Incomplete session data — clean up so we don't half-restore.
      clearLocalSession();
      return;
    }

    let cancelled = false;

    async function verifySession(cachedUser: UserResponse) {
      try {
        const res = await apiClient.get('/users/me');
        const serverUser = (res.data as ApiResponse<UserResponse>).data;
        if (cancelled) return;

        if (!serverUser || !sessionStillValid(cachedUser, serverUser)) {
          clearLocalSession(true);
          return;
        }

        saveUser(serverUser);
        setState({
          user: serverUser,
          // The interceptor may have rotated the token pair during the check.
          accessToken: getAccessToken(),
          isLoading: false,
          isAuthenticated: true,
          reauthRequired: false,
        });
      } catch (error) {
        if (cancelled) return;

        const status = axios.isAxiosError(error) ? error.response?.status : undefined;
        const backendUnreachable = status === undefined || status >= 500;

        // getAccessToken() is null when the interceptor's refresh failed and
        // already cleared storage — that is a dead session, not an outage.
        if (backendUnreachable && getAccessToken()) {
          setState({
            user: cachedUser,
            accessToken: getAccessToken(),
            isLoading: false,
            isAuthenticated: true,
            reauthRequired: false,
          });
        } else {
          clearLocalSession(true);
        }
      }
    }

    void verifySession(storedUser);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- React to session expiry detected by the Axios interceptor -------
  // A failed token refresh clears storage and emits this event; reset React
  // state here so routing reacts (no hard page reload needed) and the user
  // is sent to sign in again.
  useEffect(() => {
    return onSessionExpired(() => clearLocalSession(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, password: string): Promise<UserResponse> {
    const res = await apiClient.post('/auth/login', { email, password });
    const body = res.data as ApiResponse<LoginResponse>;
    const data = body.data;

    if (!data?.accessToken || !data.user) {
      throw new Error(body.message || 'Login failed');
    }

    saveAuth({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    });

    setState({
      user: data.user,
      accessToken: data.accessToken,
      isLoading: false,
      isAuthenticated: true,
      reauthRequired: false,
    });
    return data.user;
  }

  async function register(
    email: string,
    password: string,
    fullName: string,
  ): Promise<UserResponse> {
    await apiClient.post('/auth/register', {
      email,
      password,
      fullName,
    });
    return login(email, password);
  }

  async function logout() {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await apiClient.post('/auth/logout', { refreshToken });
      } catch {
      }
    }
    clearLocalSession();
  }

  async function logoutAll() {
    try {
      await apiClient.post('/auth/logout-all');
    } catch {
    } finally {
      clearLocalSession();
    }
  }

  // ---- Set auth state (used by the Axios interceptor's refresh flow) ----
  function setAuth(next: Partial<AuthState>) {
    setState((prev) => ({ ...prev, ...next }));
  }

  // ---- Update the signed-in user (profile edits) --------------------------
  // Persisted too, so the boot check compares against the latest profile.
  function updateUser(user: UserResponse) {
    saveUser(user);
    setState((prev) => ({ ...prev, user }));
  }

  function clearReauthRequired() {
    setState((prev) => (prev.reauthRequired ? { ...prev, reauthRequired: false } : prev));
  }

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        logoutAll,
        setAuth,
        updateUser,
        clearReauthRequired,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
