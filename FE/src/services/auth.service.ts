import { api } from "./api";
import type { ApiResponse } from "@/types/api";
import type { GoogleLoginResponse, LoginResponse } from "@/types/auth";

/**
 * AuthService
 *
 * Endpoints (AuthController):
 *   POST /api/v1/auth/register    AUTH-01 { email, password, fullName }
 *   POST /api/v1/auth/login       AUTH-02 { email, password } → ApiResponse<LoginResponse>
 *   POST /api/v1/auth/logout      AUTH-04 { refreshToken }
 *   POST /api/v1/auth/logout-all  AUTH-05 — revokes every session of the user
 *   POST /api/v1/auth/google      AUTH-09 { idToken } → ApiResponse<GoogleLoginResponse>
 *
 * The token refresh (POST /auth/refresh) stays in services/axios.ts: it must
 * bypass the interceptors that call it.
 */
export const authService = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const body = await api.post<ApiResponse<LoginResponse>>("/auth/login", { email, password });
    return body.data;
  },

  async loginWithGoogle(idToken: string): Promise<GoogleLoginResponse> {
    const body = await api.post<ApiResponse<GoogleLoginResponse>>("/auth/google", { idToken });
    return body.data;
  },

  async register(email: string, password: string, fullName: string): Promise<void> {
    await api.post<ApiResponse<unknown>>("/auth/register", { email, password, fullName });
  },

  async logout(refreshToken: string): Promise<void> {
    await api.post<ApiResponse<null>>("/auth/logout", { refreshToken });
  },

  async logoutAll(): Promise<void> {
    await api.post<ApiResponse<null>>("/auth/logout-all");
  },
};
