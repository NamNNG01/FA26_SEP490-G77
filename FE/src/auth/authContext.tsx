import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import axios from 'axios';
import { authService } from '@/services/auth.service';
import { userService } from '@/services/user.service';
import { ROUTES } from '@/app/routes';
import { Role } from '@/utils/permissions';
import {
  clearAuth,
  getAccessToken,
  getRefreshToken,
  getUser,
  onExternalAuthChange,
  saveAuth,
  saveUser,
} from './storage';
import { onSessionExpired } from './sessionExpired';
import { clearQueryCache } from '@/hooks/useCachedQuery';
import type { LoginResponse, UserResponse } from '@/types/auth';

export interface AuthState {
  user: UserResponse | null;
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
  /** POST /auth/google with a Google ID token (AUTH-09). */
  loginWithGoogle: (idToken: string) => Promise<{ user: UserResponse; newUser: boolean }>;
  logout: (revokeRemote?: boolean) => Promise<void>;
  /** POST /auth/logout-all — revokes every session. Throws on failure. */
  logoutAll: () => Promise<void>;
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
    case Role.ADMIN:
      return ROUTES.adminDashboard;
    case Role.COURSE_MANAGER:
      return ROUTES.managerDashboard;
    case Role.STUDENT:
    default:
      // My Courses is the student home (the old dashboard was merged into it).
      return ROUTES.studentCourses;
  }
}

/**
 * Router state for the navigation right after signing in or creating an account.
 * My Courses reads it: a student with no course is sent on to the catalog.
 */
export const AFTER_AUTH_STATE = { afterAuth: true } as const;
export const isAfterAuthState = (state: unknown): boolean =>
  (state as { afterAuth?: unknown } | null)?.afterAuth === true;

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
    clearQueryCache();
    setState({
      user: null,
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
        const serverUser = await userService.getCurrentUser();
        if (cancelled) return;

        if (!serverUser || !sessionStillValid(cachedUser, serverUser)) {
          clearLocalSession(true);
          return;
        }

        saveUser(serverUser);
        setState({
          user: serverUser,
          isLoading: false,
          isAuthenticated: true,
          reauthRequired: false,
        });
      } catch (error) {
        if (cancelled) return;

        // Only a transport failure counts as an outage: api.get also throws a
        // plain Error for { success: false }, which is a rejected session.
        const backendUnreachable =
          axios.isAxiosError(error) && (!error.response || error.response.status >= 500);

        // getAccessToken() is null when the interceptor's refresh failed and
        // already cleared storage — that is a dead session, not an outage.
        if (backendUnreachable && getAccessToken()) {
          setState({
            user: cachedUser,
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

  // ---- Follow sign-in / sign-out done in another tab -------------------
  // All tabs share one localStorage session, so this tab mirrors it: signed
  // out elsewhere → sign out here too; a user written elsewhere (sign-in,
  // account switch, profile edit) → adopt it.
  const userIdRef = useRef<number | null>(null);
  userIdRef.current = state.user?.userId ?? null;

  useEffect(() => {
    return onExternalAuthChange((change) => {
      if (change === 'signedOut') {
        if (userIdRef.current !== null) clearLocalSession(true);
        return;
      }
      const user = getUser();
      if (!user || !getRefreshToken()) return;
      // Cached pages belong to the previous account.
      if (userIdRef.current !== user.userId) clearQueryCache();
      setState((prev) => ({
        ...prev,
        user,
        isLoading: false,
        isAuthenticated: true,
        reauthRequired: false,
      }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Store the token pair + user from AUTH-02 / AUTH-09 and mark the session
  // authenticated.
  function startSession(data: LoginResponse | null | undefined): UserResponse {
    if (!data?.accessToken || !data.user) {
      throw new Error('Login failed');
    }

    // A new session starts with an empty page cache (useCachedQuery).
    clearQueryCache();
    saveAuth({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
    });

    setState({
      user: data.user,
      isLoading: false,
      isAuthenticated: true,
      reauthRequired: false,
    });
    return data.user;
  }

  async function login(email: string, password: string): Promise<UserResponse> {
    return startSession(await authService.login(email, password));
  }

  async function loginWithGoogle(
    idToken: string,
  ): Promise<{ user: UserResponse; newUser: boolean }> {
    const data = await authService.loginWithGoogle(idToken);
    const user = startSession(data);
    return { user, newUser: data.newUser === true };
  }

  async function register(
    email: string,
    password: string,
    fullName: string,
  ): Promise<UserResponse> {
    await authService.register(email, password, fullName);
    return login(email, password);
  }

  async function logout(revokeRemote = true) {
    const refreshToken = getRefreshToken();
    if (revokeRemote && refreshToken) {
      try {
        await authService.logout(refreshToken);
      } catch {
      }
    }
    clearLocalSession();
  }

  async function logoutAll() {
    // Keep this device signed in if the server could not revoke the other
    // sessions. The caller handles the error and only navigates away on success.
    await authService.logoutAll();
    clearLocalSession();
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
        loginWithGoogle,
        logout,
        logoutAll,
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
