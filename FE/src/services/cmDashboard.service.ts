import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';
import type { CmCourseStat, CmDashboardSummary, CmExamStat } from './cmDashboard.types';

/**
 * DASH-05 — the Course Manager dashboard panels. All three endpoints are scoped server-side to the
 * caller's courses and the exams they created, so the screen never has to filter a wider dataset.
 */

function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  });
  return search.toString();
}

export const cmDashboardService = {
  async getSummary(): Promise<CmDashboardSummary> {
    const body = await api.get<ApiResponse<CmDashboardSummary>>('/dashboard/course-manager/summary');
    return body.data;
  },

  /** Lowest pass rate first, courses without data last. */
  async getCourses(): Promise<CmCourseStat[]> {
    const body = await api.get<ApiResponse<CmCourseStat[]>>('/dashboard/course-manager/courses');
    return body.data;
  },

  /** Lowest pass rate first; exams under `minAttempts` submissions rank last. */
  async getExams(params: { courseId?: number | null; minAttempts?: number } = {}): Promise<CmExamStat[]> {
    const search = query({ courseId: params.courseId, minAttempts: params.minAttempts });
    const body = await api.get<ApiResponse<CmExamStat[]>>(`/dashboard/course-manager/exams${search ? `?${search}` : ''}`);
    return body.data;
  },
};
