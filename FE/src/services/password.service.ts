import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';

/**
 * PasswordService
 *
 * Request bodies mirror the backend DTOs exactly (com.examprep.dto.*).
 * Both endpoints are permitAll and return ApiResponse<Void>.
 *
 * Endpoints (AuthController):
 *   POST /api/v1/auth/password/forgot  { email }               (ForgotPasswordRequest)
 *   POST /api/v1/auth/password/reset   { token, newPassword }  (ResetPasswordRequest)
 *
 * forgot always answers 200 with the same message whether or not the email
 * exists (no account enumeration). reset answers 401 "Invalid or expired
 * reset token." for an unknown, used or expired token.
 */

/** Same rule as ResetPasswordRequest.newPassword (@Size(min = 6)). */
export const PASSWORD_MIN_LENGTH = 6;

/** BCrypt only uses the first 72 bytes of a password, so longer ones are rejected up front. */
export const PASSWORD_MAX_BYTES = 72;

/** True when the password's UTF-8 form is longer than BCrypt can hash. */
export function isPasswordTooLong(password: string): boolean {
  return new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES;
}

export const PASSWORD_TOO_LONG_MESSAGE = `Password must be at most ${PASSWORD_MAX_BYTES} characters`;

export const passwordService = {
  /** Resolves with the backend's confirmation message. */
  async forgotPassword(email: string): Promise<string> {
    const body = await api.post<ApiResponse<null>>('/auth/password/forgot', {
      email: email.trim(),
    });
    return body.message;
  },

  /**
   * PUT /auth/password/change  { currentPassword, newPassword }  (ChangePasswordRequest)
   * Authenticated. Answers 401 "Current password is incorrect." on a wrong
   * current password and revokes every refresh token of the user on success.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<string> {
    const body = await api.request<ApiResponse<null>>({
      method: 'put',
      url: '/auth/password/change',
      data: { currentPassword, newPassword },
    });
    return body.message;
  },

  /** Resolves with the backend's confirmation message. */
  async resetPassword(token: string, newPassword: string): Promise<string> {
    const body = await api.post<ApiResponse<null>>('/auth/password/reset', {
      token: token.trim(),
      newPassword,
    });
    return body.message;
  },
};
