import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';

/**
 * DashboardService
 *
 * Types mirror the backend DTOs exactly (com.examprep.dto.*) — do not
 * rename fields. All requests go through the existing axios instance
 * (apiClient via ./api), which attaches the Bearer token through the
 * request interceptor. No new axios instance, no manual Authorization.
 *
 * Endpoints (DashboardController):
 *   GET /api/v1/dashboard/student
 *   GET /api/v1/dashboard/course-manager
 *   GET /api/v1/dashboard/admin
 */

// ---- Student (StudentDashboardResponse) ---------------------------------

export interface StudentSummary {
  enrolledCourses: number;
  activeCourses: number;
  completedCourses: number;
  totalAttempts: number;
  averageScore: number;
}

export interface StudentRecentCourse {
  courseId: number;
  title: string;
  thumbnailUrl: string | null;
  progress: number | null;
}

export interface StudentRecentAttempt {
  attemptId: number;
  examId: number;
  examTitle: string;
  score: number | null; // BigDecimal → number
  status: string;
  submittedAt: string; // Instant → ISO string
}

export interface StudentDashboardData {
  summary: StudentSummary;
  recentCourses: StudentRecentCourse[];
  recentAttempts: StudentRecentAttempt[];
}

// ---- Content Manager (CourseManagerDashboardResponse) -------------------

export interface ManagerSummary {
  totalCourses: number;
  publishedCourses: number;
  draftCourses: number;
  totalStudents: number;
}

export interface ManagerRecentCourse {
  courseId: number;
  title: string;
  status: string;
  studentCount: number | null;
}

export interface ManagerDashboardData {
  summary: ManagerSummary;
  recentCourses: ManagerRecentCourse[];
}

// ---- Admin (AdminDashboardResponse) -------------------------------------

export interface AdminSummary {
  totalUsers: number;
  totalStudents: number;
  totalManagers: number;
  totalCourses: number;
  totalExams: number;
}

export interface AdminRecentUser {
  userId: number;
  fullName: string;
  email: string;
  role: string;
  createdAt: string; // Instant → ISO string
}

export interface AdminDashboardData {
  summary: AdminSummary;
  recentUsers: AdminRecentUser[];
}

// ---- Service ------------------------------------------------------------

export const dashboardService = {
  async getStudentDashboard(): Promise<StudentDashboardData> {
    const body = await api.get<ApiResponse<StudentDashboardData>>(
      '/dashboard/student',
    );
    return body.data;
  },

  async getManagerDashboard(): Promise<ManagerDashboardData> {
    const body = await api.get<ApiResponse<ManagerDashboardData>>(
      '/dashboard/course-manager',
    );
    return body.data;
  },

  async getAdminDashboard(): Promise<AdminDashboardData> {
    const body = await api.get<ApiResponse<AdminDashboardData>>(
      '/dashboard/admin',
    );
    return body.data;
  },
};
