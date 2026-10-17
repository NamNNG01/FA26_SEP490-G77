import React from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useSearchParams,
} from 'react-router';
import { useAuth, landingPathForRole } from '@/auth/authContext';
import { RequireRole, ROLE_ADMIN, ROLE_MANAGER, ROLE_STUDENT, ROLE_COURSE_MANAGER_ONLY } from '@/auth/RequireRole';
import { ROUTES } from '@/app/routes';
import { safeRedirect } from '@/hooks/useRequireAuth';
import { AuthLayout } from '@/layouts/AuthLayout';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { PublicLayout } from '@/layouts/PublicLayout';
import { LoadingScreen } from '@/components/LoadingScreen';

import { LoginPage } from '@/features/auth';
import { LandingPage } from '@/features/landing';
import { PlaceholderPage } from '@/features/public';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { ForgotPasswordPage, ResetPasswordPage } from '@/features/auth/pages/AuthPages';
import { ProfilePage } from '@/features/profile';
import { StudentDashboard } from '@/features/student';
import { TakeExamPage, ExamResultPage, ExamListPage } from '@/features/exam';
import { PublicExamsPage, PublicExamDetailPage } from '@/features/public-exam';
import { CMDashboard } from '@/features/content-manager';
import { QuestionBankPage } from '@/features/question';
import { CourseListPage, CourseDetailPage, CourseFormPage } from '@/features/course';
import { FlashcardManagementPage, FlashcardDeckDetailPage } from '@/features/flashcard';
import { PublicCoursesPage, PublicCourseDetailPage } from '@/features/catalog';
import {
  AdminDashboard,
  UsersPage,
  UserDetailPage,
  FinancialDashboardPage,
  SubscriptionPackagesPage,
  AIUsagePage,
  AnalyticsPage,
  AuditLogsPage,
  SystemSettingsPage,
} from '@/features/admin';

/**
 * AppContent
 *
 * Auth gate:
 *  - isLoading       → LoadingScreen (never render a redirect while the
 *                      session is being restored).
 *  - unauthenticated → PublicLayout (header / main / footer, NO sidebar) for
 *                      the public pages, plus auth forms in the narrow
 *                      centered AuthLayout.
 *  - authenticated   → the public pages KEEP PublicLayout (no sidebar), while
 *                      the application screens render inside DashboardLayout
 *                      (header + role-filtered Sidebar, swapped by <Outlet />).
 *
 * Public pages are reachable without an account: landing, courses, course
 * detail, pricing and course search.
 */
export function AppContent() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

/**
 * Landing route per role — keeps role-based routing in one place.
 * (Unknown roles fall back to /student, same as landingPathForRole.)
 */
function useLandingPath(): string {
  const { user } = useAuth();
  return landingPathForRole(user?.role);
}

/**
 * Shared public marketing placeholders. Mounted inside PublicLayout in both
 * auth branches, so these stay module-level constants instead of being
 * duplicated per branch.
 */
const pricingPlaceholder = (
  <PlaceholderPage
    title="Pricing Plans"
    subtitle="Simple, student-friendly pricing is on the way. You can browse every course and search the catalog for free in the meantime."
  />
);

const examsPlaceholder = (
  <PlaceholderPage
    title="Mock Exams"
    subtitle="Course mock exams are launching soon. Browse a course now to see its question count and exam list."
  />
);

/** Public routes — identical for guests and signed-in users, always PublicLayout. */
function publicRoutes() {
  return (
    <Route element={<PublicLayout />}>
      <Route path={ROUTES.landing} element={<LandingPage />} />
      <Route path={ROUTES.courses} element={<PublicCoursesPage />} />
      <Route path={ROUTES.courseDetail} element={<PublicCourseDetailPage />} />
      <Route path={ROUTES.pricing} element={pricingPlaceholder} />
      <Route path={ROUTES.examsIntro} element={examsPlaceholder} />
    </Route>
  );
}

/**
 * A signed-in visitor hitting /login?redirect=… goes back where they were
 * heading instead of being dropped on their role dashboard.
 */
function LoggedInLoginRedirect() {
  const [searchParams] = useSearchParams();
  const landing = useLandingPath();
  return <Navigate to={safeRedirect(searchParams.get('redirect')) ?? landing} replace />;
}

function AppRoutes() {
  const { isLoading, isAuthenticated, user } = useAuth();
  const landing = useLandingPath();

  // 1. Loading → no redirect, no layout flash.
  if (isLoading) {
    return <LoadingScreen />;
  }

  // 2. Not authenticated → public pages render FULL-WIDTH (they manage
  //     their own responsive containers). Only the auth forms sit inside
  //     AuthLayout's narrow centered column.
  if (!isAuthenticated || user === null) {
    return (
      <Routes>
        {publicRoutes()}

        {/* Auth forms — centered narrow column. */}
        <Route
          path={ROUTES.login}
          element={
            <AuthLayout>
              <LoginPage />
            </AuthLayout>
          }
        />
        <Route
          path={ROUTES.register}
          element={
            <AuthLayout>
              <RegisterPage />
            </AuthLayout>
          }
        />
        <Route
          path={ROUTES.forgotPassword}
          element={
            <AuthLayout>
              <ForgotPasswordPage />
            </AuthLayout>
          }
        />
        <Route
          path={ROUTES.resetPassword}
          element={
            <AuthLayout>
              <ResetPasswordPage />
            </AuthLayout>
          }
        />

        {/* Anything else → login (keeps ?redirect= so the destination survives). */}
        <Route path="*" element={<Navigate to={ROUTES.login} replace />} />
      </Routes>
    );
  }

  // 3. Authenticated → public pages keep the public shell; the application
  //     screens render inside ONE DashboardLayout so the sidebar is mounted
  //     exactly once and persists across route changes.
  return (
    <Routes>
      {publicRoutes()}

      <Route element={<DashboardLayout />}>
        {/* Already signed in — respect ?redirect= before falling back. */}
        <Route path={ROUTES.login} element={<LoggedInLoginRedirect />} />
        <Route path={ROUTES.register} element={<Navigate to={landing} replace />} />
        <Route path={ROUTES.forgotPassword} element={<ForgotPasswordPage />} />
        <Route path={ROUTES.resetPassword} element={<ResetPasswordPage />} />

        {/* STUDENT — learners see their own dashboard, courses, exams and
            practice attempts. No editing surfaces. */}
        <Route element={<RequireRole roles={ROLE_STUDENT} />}>
          <Route path={ROUTES.studentDashboard} element={<StudentDashboard />} />
          <Route path={ROUTES.studentCourses} element={<CourseListPage readonly />} />
          <Route path={ROUTES.studentExams} element={<ExamListPage />} />
          <Route path={ROUTES.studentPublicExam} element={<PublicExamsPage />} />
          <Route path={ROUTES.studentPublicExamDetail} element={<PublicExamDetailPage />} />
          <Route path={ROUTES.studentExam} element={<TakeExamPage />} />
          <Route path={ROUTES.studentExamResult} element={<ExamResultPage />} />
        </Route>

        {/* COURSE_MANAGER — authors content. Includes ADMIN, since
            administrators have full system access. */}
        <Route element={<RequireRole roles={ROLE_MANAGER} />}>
          <Route path={ROUTES.managerDashboard} element={<CMDashboard />} />
          <Route path={ROUTES.managerCourses} element={<CourseListPage />} />
          <Route path={ROUTES.managerCourseCreate} element={<CourseFormPage mode="create" />} />
          <Route path={ROUTES.managerCourseDetail} element={<CourseDetailPage />} />
          <Route path={ROUTES.managerQuestions} element={<QuestionBankPage />} />
          <Route path={ROUTES.managerExams} element={<ExamListPage />} />
          {/* Same shared components as the student practice-exam area. */}
          <Route path={ROUTES.managerPracticeExams} element={<PublicExamsPage />} />
          <Route path={ROUTES.managerPracticeExamDetail} element={<PublicExamDetailPage />} />
        </Route>

        {/* COURSE_MANAGER only — ADMIN is NOT allowed here. */}
        <Route element={<RequireRole roles={ROLE_COURSE_MANAGER_ONLY} />}>
          <Route path={ROUTES.managerFlashcards} element={<FlashcardManagementPage />} />
          <Route path={ROUTES.managerFlashcardDetail} element={<FlashcardDeckDetailPage />} />
        </Route>

        {/* ADMIN — system administration only. */}
        <Route element={<RequireRole roles={ROLE_ADMIN} />}>
          <Route path={ROUTES.adminDashboard} element={<AdminDashboard />} />
          <Route path={ROUTES.adminUsers} element={<UsersPage />} />
          <Route path={`${ROUTES.adminUsers}/:userId`} element={<UserDetailPage />} />
          <Route path={ROUTES.adminFinancial} element={<FinancialDashboardPage />} />
          <Route path={ROUTES.adminSubscriptions} element={<SubscriptionPackagesPage />} />
          <Route path={ROUTES.adminAiUsage} element={<AIUsagePage />} />
          <Route path={ROUTES.adminAnalytics} element={<AnalyticsPage />} />
          <Route path={ROUTES.adminAuditLogs} element={<AuditLogsPage />} />
          <Route path={ROUTES.adminSettings} element={<SystemSettingsPage />} />
        </Route>

        {/* Common — reachable by every signed-in role */}
        <Route path={ROUTES.profile} element={<ProfilePage />} />

        {/* Fallback (404) — goes to the role landing, NOT /login (which
            would immediately bounce back here and could look like a
            logout). */}
        <Route path="*" element={<Navigate to={landing} replace />} />
      </Route>
    </Routes>
  );
}