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
  /** Route pattern — render with studentModulePath(courseId, moduleId). `general` = content outside any module. */
  studentModuleDetail: '/student/courses/:courseId/modules/:moduleId',
  studentExams: '/student/exams',
  /** Materials the student uploaded (MQ-02) and the quizzes generated from them. */
  studentMaterials: '/student/materials',
  /** Study plans (SB-01..SB-04): the ACTIVE plan, auto-renew and upgrades. */
  studentSubscription: '/student/subscription',
  /** PayOS orders of courses and plans (PY-06). */
  studentPayments: '/student/payments',
  /** PayOS return / cancel URLs (BE app.payos.return-url, cancel-url). */
  paymentReturn: '/payment/return',
  paymentCancel: '/payment/cancel',
  studentMyExams: '/student/my-exams',
  studentLearningActivities: '/student/learning-activity',
  studentQuestionNotebook: '/student/questions/saved',
  studentDiscussions: '/student/discussions',
  studentDiscussionDetail: '/student/discussions/:discussionId',
  studentContributions: '/student/contributions',
  studentContributionDetail: '/student/contributions/:contributionId',
  /** Inbox (NT-01..NT-03); the header bell opens the newest few. */
  studentNotifications: '/student/notifications',
  studentQuestionIssues: '/student/question-issues',
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
  /** Route pattern — render with studentPracticeResultPath(sessionId). Module Practice result (MP-08). */
  studentPracticeResult: '/student/practice/sessions/:sessionId/result',
  /** Old Practice Exams page — redirects to Exam History filtered to practice exams. */
  studentPracticeExams: '/student/practice-exams',

  // Content Manager (backend role: COURSE_MANAGER)
  managerDashboard: '/manager/dashboard',
  managerCourses: '/manager/courses',
  managerCourseCreate: '/manager/courses/new',
  managerCourseDetail: '/manager/courses/:courseId',
  managerQuestions: '/manager/question-bank',
  managerReviews: '/manager/reviews',
  managerQuestionIssues: '/manager/question-issues',
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
  managerContests: '/manager/contests',
  managerContestCreate: '/manager/contests/new',
  /** Route pattern — render with managerContestPath(id). */
  managerContestDetail: '/manager/contests/:contestId',
  /** Route pattern — render with managerContestEditPath(id). */
  managerContestEdit: '/manager/contests/:contestId/edit',

  adminDashboard: '/admin/dashboard',
  adminUsers: '/admin/users',
  adminCategories: '/admin/categories',
  adminDiscounts: '/admin/discounts',
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

/**
 * Module of a course — e.g. studentModulePath(6, 3) → '/student/courses/6/modules/3'.
 * null (a General practice session) → '/student/courses/6/modules/general'.
 */
export function studentModulePath(courseId: number | string, moduleId: number | string | null): string {
  return `${studentCoursePath(courseId)}/modules/${moduleId ?? 'general'}`;
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

/**
 * Take-exam screen running a Module Practice session (MP-03…MP-07) — e.g. '/student/exam?practiceSessionId=5'.
 * `sessionQuestionId` opens that question first instead of the next unanswered one.
 */
export function studentModulePracticePath(sessionId: number | string, sessionQuestionId?: number | string): string {
  const qs = new URLSearchParams({ practiceSessionId: String(sessionId) });
  if (sessionQuestionId != null) qs.set('question', String(sessionQuestionId));
  return `${ROUTES.studentExam}?${qs}`;
}

/** Result of one Module Practice session (MP-08) — e.g. '/student/practice/sessions/5/result'. */
export function studentPracticeResultPath(sessionId: number | string): string {
  return ROUTES.studentPracticeResult.replace(':sessionId', encodeURIComponent(String(sessionId)));
}

/** Take-exam screen for an attempt already started — e.g. '/student/exam?attemptId=7'. */
export function studentResumeAttemptPath(attemptId: number | string): string {
  return `${ROUTES.studentExam}?attemptId=${encodeURIComponent(String(attemptId))}`;
}

/**
 * Attempt review of an exam, newest submitted attempt preselected — e.g. '/student/exam-result?examId=12'.
 * `practice` adds `&practice=1`: the result then shows no score (SA-05 does not tell the exam mode).
 */
export function studentExamAttemptsPath(examId: number | string, practice = false): string {
  return `${ROUTES.studentExamResult}?examId=${encodeURIComponent(String(examId))}${practice ? '&practice=1' : ''}`;
}

/**
 * Result of one submitted attempt — e.g. '/student/exam-result?attemptId=7&examId=12'.
 * `examId` is optional: SA-05 does not return it, and the result page needs it for "Re-attempt".
 * `practice` adds `&practice=1`, as for studentExamAttemptsPath.
 */
export function studentExamResultPath(attemptId: number | string, examId?: number | string, practice = false): string {
  const qs = new URLSearchParams({ attemptId: String(attemptId) });
  if (examId != null) qs.set('examId', String(examId));
  if (practice) qs.set('practice', '1');
  return `${ROUTES.studentExamResult}?${qs}`;
}

export function managerQuestionEditPath(id: number | string): string {
  return `${ROUTES.managerQuestions}/${id}`;
}

/** New Questions, prefilled with a copy of question `id` (unsaved until the manager saves it). */
export function managerQuestionDuplicatePath(id: number | string): string {
  return `${ROUTES.managerQuestionCreate}?duplicate=${encodeURIComponent(String(id))}`;
}

export function managerContestPath(id: number | string): string {
  return `${ROUTES.managerContests}/${id}`;
}

export function managerContestEditPath(id: number | string): string {
  return `${managerContestPath(id)}/edit`;
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
    { id: 'student-materials', title: 'My Materials', icon: <Icon.FileText className="w-4 h-4" />, path: ROUTES.studentMaterials },
    { id: 'student-contests', title: 'Contests', icon: <Icon.Trophy className="w-4 h-4" />, path: ROUTES.studentContests },
    { id: 'student-flashcards', title: 'Flashcards', icon: <Icon.Layers className="w-4 h-4" />, path: ROUTES.studentFlashcards },
    { id: 'student-activity', title: 'Learning Activity', icon: <Icon.Activity className="w-4 h-4" />, path: ROUTES.studentLearningActivities },
    { id: 'student-notebook', title: 'Question Notebook', icon: <Icon.Star className="w-4 h-4" />, path: ROUTES.studentQuestionNotebook },
    { id: 'student-subscription', title: 'Subscription', icon: <Icon.Package className="w-4 h-4" />, path: ROUTES.studentSubscription },
    { id: 'student-payments', title: 'Payments', icon: <Icon.Archive className="w-4 h-4" />, path: ROUTES.studentPayments },
  ],
  COURSE_MANAGER: [
    { id: 'manager-dashboard', title: 'Dashboard', icon: <Icon.Home className="w-4 h-4" />, path: ROUTES.managerDashboard },
    { id: 'manager-courses', title: 'Courses', icon: <Icon.Book className="w-4 h-4" />, path: ROUTES.managerCourses },
    { id: 'manager-questions', title: 'Question Bank', icon: <Icon.Database className="w-4 h-4" />, path: ROUTES.managerQuestions },
    { id: 'manager-reviews', title: 'Content review', icon: <Icon.CheckCircle className="w-4 h-4" />, path: ROUTES.managerReviews },
    { id: 'manager-question-issues', title: 'Question issues', icon: <Icon.ClipboardList className="w-4 h-4" />, path: ROUTES.managerQuestionIssues },
    { id: 'manager-exams', title: 'Exams', icon: <Icon.ClipboardList className="w-4 h-4" />, path: ROUTES.managerExams },
    { id: 'manager-flashcards', title: 'Flashcards', icon: <Icon.Layers className="w-4 h-4" />, path: ROUTES.managerFlashcards },
    { id: 'manager-contests', title: 'Contests', icon: <Icon.Trophy className="w-4 h-4" />, path: ROUTES.managerContests },
  ],
  ADMIN: [
    { id: 'admin-dashboard', title: 'Dashboard', icon: <Icon.Home className="w-4 h-4" />, path: ROUTES.adminDashboard },
    { id: 'admin-users', title: 'User Management', icon: <Icon.Users className="w-4 h-4" />, path: ROUTES.adminUsers },
    { id: 'admin-categories', title: 'Categories', icon: <Icon.Folder className="w-4 h-4" />, path: ROUTES.adminCategories },
    { id: 'admin-discounts', title: 'Discounts', icon: <Icon.Award className="w-4 h-4" />, path: ROUTES.adminDiscounts },
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
