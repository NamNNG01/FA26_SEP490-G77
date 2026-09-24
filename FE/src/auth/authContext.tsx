import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { apiClient } from '@/services/axios';
import {
  clearAuth,
  getAccessToken,
  getRefreshToken,
  getUser,
  saveAuth,
  saveTokens,
} from './storage';
import { onSessionExpired } from './sessionExpired';

/**
 * Backend DTO types (mirror com.examprep.dto)
 */
export interface RoleResponse {
  code: string;
  name: string;
}

export interface UserResponse {
  userId: number; // Backend sends a numeric Long
  email: string;
  fullName: string;
  avatarUrl: string | null;
  role: RoleResponse;
  status: string;
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
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<UserResponse>;
  register: (email: string, password: string, fullName: string) => Promise<UserResponse>;
  logout: () => Promise<void>;
  /** POST /auth/logout-all — revokes every session. Throws on failure. */
  logoutAll: () => Promise<void>;
  setAuth: (state: Partial<AuthState>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Landing page per backend role code (Role.CODE_* constants).
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    accessToken: null,
    isLoading: true,
    isAuthenticated: false,
  });

  // ---- Shared local cleanup for EVERY logout path -----------------------
  // Used by logout(), logoutAll() and the session-expired bridge below so
  // tokens/user cleanup and state reset live in exactly one place.
  function clearLocalSession() {
    clearAuth();
    setState({
      user: null,
      accessToken: null,
      isLoading: false,
      isAuthenticated: false,
    });
  }

  // ---- Boot session on mount (persistence after page refresh) ----------
  //
  // The backend Authentication API exposes only:
  //   POST /auth/register | /auth/login | /auth/refresh |
  //   /auth/logout | /auth/logout-all
  // There is NO /auth/me or /users/me endpoint, so the session is restored
  // synchronously from storage — the user object (returned by /auth/login)
  // is persisted at login time and read back here. No network call, no
  // false logout.
  useEffect(() => {
    const accessToken = getAccessToken();
    const refreshToken = getRefreshToken();
    const user = getUser();

    if (accessToken && refreshToken && user) {
      setState({
        user,
        accessToken,
        isLoading: false,
        isAuthenticated: true,
      });
    } else {
      // Incomplete session data — clean up so we don't half-restore.
      clearAuth();
      setState({
        user: null,
        accessToken: null,
        isLoading: false,
        isAuthenticated: false,
      });
    }
  }, []);

  // ---- React to session expiry detected by the Axios interceptor -------
  // A failed token refresh clears storage and emits this event; reset React
  // state here so routing reacts (no hard page reload needed).
  useEffect(() => {
    return onSessionExpired(() => clearLocalSession());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Login -----------------------------------------------------------
  /** Resolves with the fresh user so callers can navigate role-aware. */
  async function login(email: string, password: string): Promise<UserResponse> {
    const res = await apiClient.post('/auth/login', { email, password });
    // Backend wraps the payload: ApiResponse<LoginResponse> → response.data.data
    const body = res.data as ApiResponse<LoginResponse>;
    const data = body.data;

    if (!data?.accessToken || !data.user) {
      throw new Error(body.message || 'Login failed: malformed response from server.');
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
    });
    // SPA navigation happens in the page components AFTER this state update
    // (see LoginPage / RegisterPage). A full page load here would remount
    // AuthProvider and race against the state update above.
    return data.user;
  }

  // ---- Register ----------------------------------------------------------
  // Backend register returns UserResponse only (no tokens), so we log the
  // user in right after a successful registration.
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

  // ---- Logout -----------------------------------------------------------
  async function logout() {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      try {
        await apiClient.post('/auth/logout', { refreshToken });
      } catch {
        // Backend logout is best-effort; always clear local state.
      }
    }
    clearLocalSession();
    // No full page reload — routing reacts to the state change above
    // (AppRoutes renders the AuthLayout branch once isAuthenticated is false).
  }

  // ---- Logout from ALL devices -------------------------------------------
  // Backend: POST /api/v1/auth/logout-all (authenticated; the request
  // interceptor attaches the Bearer token automatically — no hardcoded
  // headers, no token storage here).
  //
  // On failure this THROWS without clearing anything, so the caller keeps
  // the user logged in and can surface the backend error message.
  async function logoutAll() {
    const res = await apiClient.post('/auth/logout-all');
    const body = res.data as ApiResponse<unknown> | undefined;
    if (body && body.success === false) {
      throw new Error(body.message || 'Logout failed.');
    }
    clearLocalSession();
  }

  // ---- Set auth state (used by the Axios interceptor's refresh flow) ----
  function setAuth(next: Partial<AuthState>) {
    setState((prev) => ({ ...prev, ...next }));
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
