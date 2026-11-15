/**
 * DASH-05 — Course Manager dashboard responses (GET /api/v1/dashboard/course-manager/…).
 *
 * Every figure is scoped to the caller: the courses they manage (owner or co-manager) and the
 * course exams they created in them. Scores are percentages of each attempt's own frozen max
 * score, so an exam edited later cannot restate an old attempt.
 *
 * Conventions: percentages and scores are 0–100; `null` means "no data" (never 0).
 */

export type CmExamStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface CmDashboardSummary {
  /** Courses the CM is listed on as owner or co-manager. */
  managedCourses: number;
  /** Distinct students with an ACTIVE enrollment. */
  activeStudents: number;
  myExams: { total: number; published: number; draft: number; archived: number };
  /** Submitted attempts of my exams in the last 7 days. */
  submittedAttempts7d: number;
  /** Average percentage over graded attempts; null when nothing is graded yet. */
  avgScore: number | null;
  /** Share of graded attempts at or above `CM_PASS_THRESHOLD_PERCENT`; null when nothing is graded. */
  passRate: number | null;
  /** Attempts still waiting for grading (SUBMITTED or GRADING). */
  pendingGrading: number;
}

export interface CmCourseStat {
  courseId: number;
  title: string;
  activeStudents: number;
  /** Exams I created in this course. */
  myExamCount: number;
  submittedAttempts: number;
  avgScore: number | null;
  passRate: number | null;
}

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

/** A graded attempt counts as passed from this share of the exam's max score. */
export const CM_PASS_THRESHOLD_PERCENT = 50;
