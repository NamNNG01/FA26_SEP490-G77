import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { Page } from './adminDiscount.service';

export type AdminUserRole = 'STUDENT' | 'COURSE_MANAGER' | 'ADMIN';
export type AdminUserStatus = 'ACTIVE' | 'INACTIVE';

/** Profile fields shared by the list row, the update response and the detail. */
export interface AdminUserProfile {
  userId: number;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  role: AdminUserRole;
  status: AdminUserStatus;
  createdAt: string;
}

/** UM-01: one row of GET /admin/users. */
export interface AdminUserItem extends AdminUserProfile {
  /** Null when the account has never logged in. */
  lastLoginAt: string | null;
  enrolledCoursesCount: number;
}

/** UM-01: overview counters above the list — computed across every account, filters ignored. */
export interface AdminUserListStats {
  total: number;
  active: number;
  inactive: number;
  /** Accounts created since the start of the current month. */
  newThisMonth: number;
}

export type AdminUserPage = Page<AdminUserItem> & { stats: AdminUserListStats };

/** UM-02: learning statistics of the user detail. */
export interface AdminUserLearningStats {
  coursesEnrolled: number;
  examsTaken: number;
  /** Null when the user has no scored attempt. */
  averageScore: number | null;
  /** Submit time of the most recent attempt; null when the user never submitted. */
  lastActivityAt: string | null;
}

/** UM-02: one of the (at most 5) most recent submitted attempts, newest first. */
export interface AdminUserRecentAttempt {
  attemptId: number;
  examId: number;
  examTitle: string;
  score: number | null;
  status: string;
  submittedAt: string;
}

export interface AdminUserDetail extends AdminUserProfile {
  lastLoginAt: string | null;
  stats: AdminUserLearningStats;
  recentAttempts: AdminUserRecentAttempt[];
}

/** UM-03 body: every field is required; the backend rejects duplicate e-mails (409). */
export interface AdminUserUpdatePayload {
  fullName: string;
  email: string;
  role: AdminUserRole;
  status: AdminUserStatus;
}

function query(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  return search.toString();
}

export const adminUserService = {
  /** UM-01 — search/filter/paginate the user list. Search matches name or e-mail partially. */
  async list(params: { search?: string; role?: string; status?: string; page: number; size: number }) {
    const res = await api.get<ApiResponse<AdminUserPage>>(`/admin/users?${query(params)}`);
    return res.data;
  },
  /** UM-02 — full profile with learning statistics and the latest attempts (404 unknown id). */
  async get(userId: number) {
    const res = await api.get<ApiResponse<AdminUserDetail>>(`/admin/users/${userId}`);
    return res.data;
  },
  /** UM-03 — update full name, e-mail, role and status. */
  async update(userId: number, payload: AdminUserUpdatePayload) {
    const res = await api.request<ApiResponse<AdminUserProfile>>({
      method: 'put', url: `/admin/users/${userId}`, data: payload,
    });
    return res.data;
  },
  /** UM-04 — activate or deactivate an account. */
  async setStatus(userId: number, status: AdminUserStatus) {
    const res = await api.request<ApiResponse<AdminUserProfile>>({
      method: 'patch', url: `/admin/users/${userId}/status`, data: { status },
    });
    return res.data;
  },
  /** UM-05 — send the password-reset e-mail. */
  async resetPassword(userId: number) {
    await api.post<ApiResponse<null>>(`/admin/users/${userId}/reset-password`);
  },
};
