import { api } from './api';
import type { ApiResponse } from '@/auth/authContext';

/**
 * DASH-04 — the admin dashboard report (GET /api/v1/dashboard/admin/report).
 *
 * Every figure is aggregated from the live database: collected PayOS payments (course sales and
 * subscription plans), accounts, courses, enrollment rows and settled AI usage logs. Periods are
 * the server's calendar units; `revenueSeries` always carries one entry per period of the filter.
 */

export type Granularity = 'day' | 'month' | 'year';
export type TopCourseSort = 'revenue' | 'enrollments';

export interface DashboardFilter {
  granularity: Granularity;
  /** Inclusive bounds: YYYY-MM-DD, YYYY-MM or YYYY depending on granularity. */
  from: string;
  to: string;
}

/** One bucket of the trend chart: YYYY-MM-DD, YYYY-MM or YYYY. */
export interface RevenuePoint {
  period: string;
  courseSales: number;
  aiSubscription: number;
}

export interface PlanRevenue {
  plan: string;
  revenue: number;
}

export interface CourseRevenue {
  title: string;
  revenue: number;
}

export interface TopCourse {
  courseId: number;
  title: string;
  revenue: number;
  enrollments: number;
  status: 'PUBLISHED' | 'DRAFT';
}

export interface AiUsageLog {
  id: string;
  /** Server-local ISO date-time, e.g. 2026-11-16T14:05:00. */
  time: string;
  user: string;
  feature: string;
  tokens: number;
  success: boolean;
}

export interface AdminDashboardReport {
  summary: {
    /** Collected payments of the period, after discounts. */
    netRevenue: number;
    users: { total: number; students: number; courseManagers: number; admins: number };
    courses: { active: number; total: number };
    ai: { tokensUsed: number };
  };
  revenueSeries: RevenuePoint[];
  revenueBySource: {
    courseSales: number;
    aiSubscription: number;
    aiPlans: PlanRevenue[];
    topSellingCourses: CourseRevenue[];
  };
  topCourses: TopCourse[];
  /** Newest settled AI requests of the period (capped) — `aiLogTotals` counts them all. */
  aiLogs: AiUsageLog[];
  aiLogTotals: { requests: number; failed: number; shown: number };
  /** First calendar day the platform has data (YYYY-MM-DD) — bounds the period picker. */
  dataStart: string;
}

export const adminDashboardService = {
  async getReport(filter: DashboardFilter, sortBy: TopCourseSort): Promise<AdminDashboardReport> {
    const params = new URLSearchParams({
      granularity: filter.granularity,
      from: filter.from,
      to: filter.to,
      sortBy,
    });
    const body = await api.get<ApiResponse<AdminDashboardReport>>(`/dashboard/admin/report?${params.toString()}`);
    return body.data;
  },
};
