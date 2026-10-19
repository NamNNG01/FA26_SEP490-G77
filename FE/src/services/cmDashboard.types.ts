/**
 * Course Manager dashboard v2 — response shapes.
 *
 * Named after the planned API contract so the mock in
 * features/content-manager/mocks can be swapped for real calls without
 * touching the UI. Endpoints (not implemented on the backend yet):
 *
 *   GET /api/v1/dashboard/course-manager/summary?range=7d            → CmDashboardSummary
 *   GET /api/v1/dashboard/course-manager/courses?sort=passRate&page=&size=
 *                                                                    → CmCourseStat[]
 *   GET /api/v1/dashboard/course-manager/exams?courseId=&sort=passRate&minAttempts=5&page=&size=
 *                                                                    → CmExamStat[]
 *
 * Conventions: percentages and scores are 0–100; `null` means "no data"
 * (never 0). Exam figures only count exams created by the current CM.
 */

export interface CmDashboardSummary {
  /** Courses the CM is listed on in course_managers. */
  managedCourses: number;
  /** Distinct students with an ACTIVE enrollment. */
  activeStudents: number;
  myExams: { total: number; published: number; draft: number; hidden: number };
  /** GRADING + GRADED attempts in the last 7 days (practice excluded). */
  submittedAttempts7d: number;
  /** 0–100, GRADED attempts only. */
  avgScore: number | null;
  /** 0–100 (%), GRADED attempts only. */
  passRate: number | null;
  /** Attempts currently in GRADING. */
  pendingGrading: number;
  /** % change vs the previous 7 days; null when the previous period was 0. */
  deltas: {
    submittedAttempts: number | null;
    avgScore: number | null;
    passRate: number | null;
  };
}

export interface CmCourseStat {
  courseId: number;
  title: string;
  activeStudents: number;
  myExamCount: number;
  submittedAttempts: number;
  avgScore: number | null;
  passRate: number | null;
}

export type CmExamStatus = 'PUBLISHED' | 'DRAFT' | 'HIDDEN';

export interface CmExamStat {
  examId: number;
  title: string;
  courseId: number;
  courseTitle: string;
  status: CmExamStatus;
  submittedAttempts: number;
  avgScore: number | null;
  passRate: number | null;
  avgDurationMinutes: number | null;
  pendingGrading: number;
}

/** Below this many submitted attempts an exam's score / pass rate is not meaningful. */
export const CM_MIN_ATTEMPTS = 5;
