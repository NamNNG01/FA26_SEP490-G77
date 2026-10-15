import { api } from './api';
import type { ApiResponse, UserResponse } from '@/auth/authContext';

/**
 * UserService
 *
 * Types mirror the backend DTOs exactly (com.examprep.dto.*).
 *
 * Endpoints (UserController):
 *   GET /api/v1/users/me   USER-01 → ApiResponse<UserResponse>
 *   PUT /api/v1/users/me   USER-02 { fullName?, avatarUrl? } → ApiResponse<UserResponse>
 *
 * USER-02 only changes fullName and/or avatarUrl — email, role, status and
 * password cannot be changed through it.
 */

/** UpdateProfileRequest: both fields optional, null/absent = unchanged. */
export interface UpdateProfileRequest {
  fullName?: string;
  avatarUrl?: string;
}

/** Same rule as UpdateProfileRequest.fullName (@Size(max = 100)). */
export const FULL_NAME_MAX_LENGTH = 100;

export const userService = {
  async getCurrentUser(): Promise<UserResponse> {
    const body = await api.get<ApiResponse<UserResponse>>('/users/me');
    return body.data;
  },

  async updateProfile(request: UpdateProfileRequest): Promise<UserResponse> {
    const body = await api.request<ApiResponse<UserResponse>>({
      method: 'put',
      url: '/users/me',
      data: request,
    });
    return body.data;
  },
};
