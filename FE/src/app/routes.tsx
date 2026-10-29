import React from 'react';
import { Icon } from '@/assets/icons';
import { Role } from '@/utils/permissions';

/**
 * Central route registry — single source of truth for navigation paths.
 * Components import from here instead of hardcoding URLs.
 */
export const ROUTES = {
  landing: '/',
  login: '/login',
  register: '/register',

  // Public marketing pages (no auth required)
  courses: '/courses',
  /** Route pattern — render with coursePath(id). */
  courseDetail: '/courses/:courseId',
  examsIntro: '/exams',
  pricing: '/pricing',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  profile: '/profile',

  // Student
  /** Legacy — redirects to My Courses (the dashboard was merged into it). */
  studentDashboard: '/student/dashboard',
  studentCourses: '/student/courses',
  studentProfile: '/student/profile',
  studentContests: '/student/contests',
  studentContestDetail: '/student/contests/:contestId',
  /** Route pattern — render with studentCoursePath(id). */
  studentCourseDetail: '/student/courses/:courseId',
  /** Route pattern — render with studentWeaknessReportPath(id). AI-04 report of one course. */
  studentWeaknessReport: '/student/courses/:courseId/weakness-report',
  studentExams: '/student/exams',
  studentMyExams: '/student/my-exams',
  studentLearningActivities: '/student/learning-activity',
  studentQuestionNotebook: '/student/questions/saved',
  studentDiscussions: '/student/discussions',
  studentDiscussionDetail: '/student/discussions/:discussionId',
  studentContributions: '/student/contributions',
  studentContributionDetail: '/student/contributions/:contributionId',
  /** Route pattern — render with studentExamPath(id). */
  studentExamDetail: '/student/exams/:examId',
  studentFlashcards: '/student/flashcards',
  /** Route pattern — render with studentDeckPath(id). */
  studentFlashcardDeck: '/student/flashcards/:deckId',
  studentPublicExam: '/student/public-exam',
  /** Route pattern — render with publicExamPath(id). */
  studentPublicExamDetail: '/student/public-exam/:examId',
  studentExam: '/student/exam',
  studentExamResult: '/student/exam-result',
  /** Client-side practice quiz (random / from material) — render with studentPracticePath(id). */
  studentPractice: '/student/practice',
  /** Custom practice exams the student generated (PQ-02). */
  studentPracticeExams: '/student/practice-exams',

  // Content Manager (backend role: COURSE_MANAGER)
  managerDashboard: '/manager/dashboard',
  managerCourses: '/manager/courses',
  managerCourseCreate: '/manager/courses/new',
  managerCourseDetail: '/manager/courses/:courseId',
  managerQuestions: '/manager/question-bank',
  managerQuestionCreate: '/manager/question-bank/new',
  /** Route pattern — render with managerQuestionEditPath(id). */
  managerQuestionEdit: '/manager/question-bank/:questionId',
  managerExams: '/manager/exams',
  managerExamQuizNew: '/manager/exams/quiz/new',
  managerExamQuizEdit: '/manager/exams/quiz/:id',
  managerExamEssayNew: '/manager/exams/essay/new',
  managerExamEssayEdit: '/manager/exams/essay/:id',
  managerExamDiagramNew: '/manager/exams/diagram/new',
  managerExamDiagramEdit: '/manager/exams/diagram/:id',
  managerFlashcards: '/manager/flashcards',
  /** Route pattern — render with flashcardDeckPath(id). */
  managerFlashcardDetail: '/manager/flashcards/:deckId',
  /** Same pages as the student practice-exam area, mounted under /manager. */
  managerPracticeExams: '/manager/practice-exams',
  managerPracticeExamDetail: '/manager/practice-exams/:examId',

  adminDashboard: '/admin/dashboard',
  adminUsers: '/admin/users',
  adminCategories: '/admin/categories',
  adminSubscriptions: '/admin/subscriptions',
  adminAnalytics: '/admin/analytics',
  adminAuditLogs: '/admin/audit-logs',
  adminSettings: '/admin/settings',
} as const;

/** Concrete course detail URL — e.g. coursePath(12) → '/courses/12'. */
export function coursePath(courseId: number | string): string {
  return `${ROUTES.courses}/${courseId}`;
}

/** Catalog URL, optionally pre-filled with a search — e.g. courseSearchPath('aws') → '/courses?q=aws'. */
export function courseSearchPath(query?: string): string {
  const q = query?.trim();
  return q ? `${ROUTES.courses}?q=${encodeURIComponent(q)}` : ROUTES.courses;
}

export function studentCoursePath(id: number | string): string {
  return `${ROUTES.studentCourses}/${id}`;
}

/** AI weakness report of a course — e.g. studentWeaknessReportPath(6) → '/student/courses/6/weakness-report'. */
export function studentWeaknessReportPath(courseId: number | string): string {
  return `${studentCoursePath(courseId)}/weakness-report`;
}

export function studentDeckPath(id: number | string): string {
  return `${ROUTES.studentFlashcards}/${id}`;
}

/** Read-only exam detail — e.g. studentExamPath(12) → '/student/exams/12'. */
export function studentExamPath(examId: number | string): string {
  return `${ROUTES.studentExams}/${examId}`;
}

/** Take-exam screen, starting (or resuming) an attempt — e.g. '/student/exam?examId=12'. */
export function studentTakeExamPath(examId: number | string): string {
  return `${ROUTES.studentExam}?examId=${encodeURIComponent(String(examId))}`;
}

/**
 * Take-exam screen for a practice exam (PQ-01 / AI-01) — e.g. '/student/exam?examId=12&practice=1'.
 * `practice=1` turns on "Check answer" per question.
 */
export function studentTakePracticePath(examId: number | string): string {
  return `${studentTakeExamPath(examId)}&practice=1`;
}

/** Practice quiz screen — e.g. '/student/practice?quizId=pq1'. */
export function studentPracticePath(quizId: string): string {
  return `${ROUTES.studentPractice}?quizId=${encodeURIComponent(quizId)}`;
}

/** Take-exam screen for an attempt already started — e.g. '/student/exam?attemptId=7'. */
export function studentResumeAttemptPath(attemptId: number | string): string {
  return `${ROUTES.studentExam}?attemptId=${encodeURIComponent(String(attemptId))}`;
}

/** Attempt review of an exam, newest submitted attempt preselected — e.g. '/student/exam-result?examId=12'. */
export function studentExamAttemptsPath(examId: number | string): string {
  return `${ROUTES.studentExamResult}?examId=${encodeURIComponent(String(examId))}`;
}

/**
 * Result of one submitted attempt — e.g. '/student/exam-result?attemptId=7&examId=12'.
 * `examId` is optional: SA-05 does not return it, and the result page needs it for "Re-attempt".
 */
export function studentExamResultPath(attemptId: number | string, examId?: number | string): string {
  const qs = new URLSearchParams({ attemptId: String(attemptId) });
  if (examId != null) qs.set('examId', String(examId));
  return `${ROUTES.studentExamResult}?${qs}`;
}

export function managerQuestionEditPath(id: number | string): string {
  return `${ROUTES.managerQuestions}/${id}`;
}

/** New Questions, prefilled with a copy of question `id` (unsaved until the manager saves it). */
export function managerQuestionDuplicatePath(id: number | string): string {
  return `${ROUTES.managerQuestionCreate}?duplicate=${encodeURIComponent(String(id))}`;
}

export function managerCourseDetailPath(id: number | string): string {
  return `${ROUTES.managerCourses}/${id}`;
}

export function managerExamQuizEditPath(id: number | string): string {
  return `/manager/exams/quiz/${id}`;
}

export function managerExamEssayEditPath(id: number | string): string {
  return `/manager/exams/essay/${id}`;
}

/** Concrete practice exam detail URL — e.g. publicExamPath('EX-P-1001') → '/student/public-exam/EX-P-1001'. */
export function publicExamPath(id: string): string {
  return `${ROUTES.studentPublicExam}/${id}`;
}

/** Flashcard deck detail URL — e.g. flashcardDeckPath('FD-1024') → '/manager/flashcards/FD-1024'. */
export function flashcardDeckPath(id: string): string {
  return `${ROUTES.managerFlashcards}/${encodeURIComponent(id)}`;
}

/** Same page, manager-scoped URL — e.g. managerPublicExamPath('EX-P-1001') → '/manager/practice-exams/EX-P-1001'. */
export function managerPublicExamPath(id: string): string {
  return `${ROUTES.managerPracticeExams}/${id}`;
}

/**
 * Detail URL for the signed-in role. The two role areas are separate mounts of
 * the same components, so links must stay inside the area the user is in —
 * otherwise a manager clicking a card from /manager/practice-exams would be
 * bounced into the /student tree. Everyone else (students, admins) uses the
 * student path.
 */
export function publicExamPathFor(roleCode: string | null | undefined, id: string): string {
  return roleCode === Role.COURSE_MANAGER ? managerPublicExamPath(id) : publicExamPath(id);
}

/** List URL for the signed-in role — the "back" target for the detail page. */
export function publicExamListPathFor(roleCode: string | null | undefined): string {
  return roleCode === Role.COURSE_MANAGER ? ROUTES.managerPracticeExams : ROUTES.studentPublicExam;
}

export interface MenuItem {
  id: string;
  title: string;
  icon: React.ReactNode;
  path: string;
}

/**
 * Sidebar menu per role — keyed by the backend role code
 * (com.examprep.entities.Role.CODE_*: STUDENT | COURSE_MANAGER | ADMIN).
 *
 * One flat list per role, NO section headers. The Sidebar renders exactly
 * the list for the authenticated user's role (read from AuthContext) via a
 * single map lookup — no if-chains, no per-role components, no hardcoded
 * roles at call sites.
 */
export const menuByRole: Record<string, MenuItem[]> = {
  STUDENT: [
    { id: 'student-courses', title: 'My Courses', icon: <Icon.Book className="w-4 h-4" />, path: ROUTES.studentCourses },
    { id: 'student-exams', title: 'Exam History', icon: <Icon.ClipboardList className="w-4 h-4" />, path: ROUTES.studentExams },
    { id: 'student-practice-exams', title: 'Practice Exams', icon: <Icon.Zap className="w-4 h-4" />, path: ROUTES.studentPracticeExams },
    { id: 'student-contests', title: 'Contests', icon: <Icon.Trophy className="w-4 h-4" />, path: ROUTES.studentContests },
    { id: 'student-flashcards', title: 'Flashcards', icon: <Icon.Layers className="w-4 h-4" />, path: ROUTES.studentFlashcards },
    { id: 'student-activity', title: 'Learning Activity', icon: <Icon.Activity className="w-4 h-4" />, path: ROUTES.studentLearningActivities },
    { id: 'student-notebook', title: 'Question Notebook', icon: <Icon.Star className="w-4 h-4" />, path: ROUTES.studentQuestionNotebook },
  ],
  COURSE_MANAGER: [
    { id: 'manager-dashboard', title: 'Dashboard', icon: <Icon.Home className="w-4 h-4" />, path: ROUTES.managerDashboard },
    { id: 'manager-courses', title: 'Courses', icon: <Icon.Book className="w-4 h-4" />, path: ROUTES.managerCourses },
    { id: 'manager-questions', title: 'Question Bank', icon: <Icon.Database className="w-4 h-4" />, path: ROUTES.managerQuestions },
    { id: 'manager-exams', title: 'Exams', icon: <Icon.ClipboardList className="w-4 h-4" />, path: ROUTES.managerExams },
    { id: 'manager-flashcards', title: 'Flashcards', icon: <Icon.Layers className="w-4 h-4" />, path: ROUTES.managerFlashcards },
  ],
  ADMIN: [
    { id: 'admin-dashboard', title: 'Dashboard', icon: <Icon.Home className="w-4 h-4" />, path: ROUTES.adminDashboard },
    { id: 'admin-users', title: 'User Management', icon: <Icon.Users className="w-4 h-4" />, path: ROUTES.adminUsers },
    { id: 'admin-categories', title: 'Categories', icon: <Icon.Folder className="w-4 h-4" />, path: ROUTES.adminCategories },
    { id: 'admin-courses', title: 'Courses', icon: <Icon.Book className="w-4 h-4" />, path: ROUTES.managerCourses },
    { id: 'admin-subscriptions', title: 'Subscriptions', icon: <Icon.Package className="w-4 h-4" />, path: ROUTES.adminSubscriptions },
    { id: 'admin-analytics', title: 'Analytics', icon: <Icon.BarChart className="w-4 h-4" />, path: ROUTES.adminAnalytics },
    { id: 'admin-audit-logs', title: 'Audit Logs', icon: <Icon.Activity className="w-4 h-4" />, path: ROUTES.adminAuditLogs },
    { id: 'admin-settings', title: 'System Settings', icon: <Icon.Settings className="w-4 h-4" />, path: ROUTES.adminSettings },
  ],
};

/**
 * Menu items for the given backend role code — a single map lookup.
 * Unknown/missing roles get an empty list (no menu leaks).
 */
export function getMenuForRole(roleCode: string | null | undefined): MenuItem[] {
  return (roleCode && menuByRole[roleCode]) || [];
}
