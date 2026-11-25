/**
 * Auth DTO types (mirror com.examprep.dto).
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
  /** False for a Google-only account (AUTH-09) that never set a password. */
  hasPassword?: boolean;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: UserResponse;
}

/** AUTH-09: LoginResponse plus whether this call created the account. */
export interface GoogleLoginResponse extends LoginResponse {
  newUser: boolean;
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
