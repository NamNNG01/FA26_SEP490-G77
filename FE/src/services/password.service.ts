import { api } from "./api";
import type { ApiResponse } from "@/types/api";

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

/** Password policy planned for registration and password reset. */
export const PASSWORD_MIN_LENGTH = 8;

/** Requires a minimum length, uppercase letter, number, and symbol. */
export const PASSWORD_POLICY_REGEX = new RegExp(
  `^(?=.*\\p{Lu})(?=.*\\p{N})(?=.*[\\p{P}\\p{S}])[\\s\\S]{${PASSWORD_MIN_LENGTH},}$`,
  "u",
);

/** BCrypt only uses the first 72 bytes of a password, so longer ones are rejected up front. */
export const PASSWORD_MAX_BYTES = 72;

/** True when the password's UTF-8 form is longer than BCrypt can hash. */
export function isPasswordTooLong(password: string): boolean {
  return new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES;
}

export const PASSWORD_TOO_LONG_MESSAGE = `Password is too long. Use at most ${PASSWORD_MAX_BYTES} UTF-8 bytes.`;

export interface PasswordCheck {
  id: "length" | "uppercase" | "number" | "symbol" | "maxBytes";
  label: string;
  met: boolean;
}

/**
 * Every rule of the password policy with whether `password` meets it, for a
 * live checklist. The byte limit is listed only once it is broken.
 */
export function getPasswordChecks(password: string): PasswordCheck[] {
  const checks: PasswordCheck[] = [
    {
      id: "length",
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    { id: "uppercase", label: "An uppercase letter", met: /\p{Lu}/u.test(password) },
    { id: "number", label: "A number", met: /\p{N}/u.test(password) },
    { id: "symbol", label: "A symbol (e.g. ! @ # $)", met: /[\p{P}\p{S}]/u.test(password) },
  ];
  if (isPasswordTooLong(password))
    checks.push({ id: "maxBytes", label: `At most ${PASSWORD_MAX_BYTES} UTF-8 bytes`, met: false });
  return checks;
}

/** Returns the first password policy error, or null when the password is valid. */
export function getPasswordValidationError(password: string): string | null {
  if (!password.trim()) {
    return "Password is required";
  }
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (!/\p{Lu}/u.test(password)) {
    return "Password must include at least one uppercase letter";
  }
  if (!/\p{N}/u.test(password)) {
    return "Password must include at least one number";
  }
  if (!/[\p{P}\p{S}]/u.test(password)) {
    return "Password must include at least one symbol";
  }
  if (!PASSWORD_POLICY_REGEX.test(password)) {
    return "Password does not meet the password requirements";
  }
  if (isPasswordTooLong(password)) {
    return PASSWORD_TOO_LONG_MESSAGE;
  }
  return null;
}

export const passwordService = {
  /** Resolves with the backend's confirmation message. */
  async forgotPassword(email: string): Promise<string> {
    const body = await api.post<ApiResponse<null>>("/auth/password/forgot", {
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
      method: "put",
      url: "/auth/password/change",
      data: { currentPassword, newPassword },
    });
    return body.message;
  },

  /** Resolves with the backend's confirmation message. */
  async resetPassword(token: string, newPassword: string): Promise<string> {
    const body = await api.post<ApiResponse<null>>("/auth/password/reset", {
      token: token.trim(),
      newPassword,
    });
    return body.message;
  },
};
