import React, { useEffect, useState } from 'react';
import {
  createBrowserRouter,
  RouterProvider,
  Routes,
  Route,
  Navigate,
  useLocation,
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
import { Role } from '@/utils/permissions';

import { LoginPage } from '@/features/auth';
import { LandingPage } from '@/features/landing';
import { PlaceholderPage } from '@/features/public';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { ForgotPasswordPage, ResetPasswordPage } from '@/features/auth/pages/AuthPages';
import { ProfilePage } from '@/features/profile';
import {
  MyCoursesPage,
  StudentCourseDetailPage,
  MyExamsPage,
  StudentFlashcardsPage,
  StudentDeckStudyPage,
  StudentExamDetailPage,
  StudentTakeExamPage,
  StudentExamResultPage,
  StudentPracticeQuizPage,
  StudentLearningActivityPage,
  StudentQuestionNotebookPage,
  StudentContestsPage,
  StudentCommunityPage,
  StudentContributionsPage,
  StudentWeaknessReportPage,
  StudentPracticeExamsPage,
} from '@/features/student';
import { ExamListPage, ExamFormPage } from '@/features/exam';
import { PublicExamsPage, PublicExamDetailPage } from '@/features/public-exam';
import { CMDashboard } from '@/features/content-manager';
import { QuestionBankPage, QuestionDetailPage, QuestionFormPage } from '@/features/question';
import { CourseListPage, CourseDetailPage, CourseFormPage } from '@/features/course';
import { FlashcardManagementPage, FlashcardDeckDetailPage } from '@/features/flashcard';
import { PublicCoursesPage, PublicCourseDetailPage } from '@/features/catalog';
import {
  AdminDashboard,
  UsersPage,
  UserDetailPage,
  SubscriptionPackagesPage,
  AnalyticsPage,
  AuditLogsPage,
  SystemSettingsPage,
  CategoriesPage,
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
 *  - authenticated   → the public pages KEEP PublicLayout (no sidebar; a student's
 *                      catalog /courses is the exception), while
 *                      the application screens render inside DashboardLayout
 *                      (header + role-filtered Sidebar, swapped by <Outlet />).
 *
 * Public pages are reachable without an account: landing, courses, course
 * detail, pricing and course search.
 */
export function AppContent() {
  return <RouterProvider router={router} />;
}

/**
 * A data router so pages can use `useBlocker` (unsaved-changes guard). The
 * route table itself stays in <AppRoutes /> as descendant <Routes>.
 */
const router = createBrowserRouter([{ path: '*', element: <AppRoutes /> }]);

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

/**
 * Public routes — identical for guests and signed-in users, always
 * PublicLayout. Only the "/" element differs (see SignedInHome).
 * `withCatalog = false` leaves the catalog out: a signed-in student browses it
 * inside DashboardLayout (with the sidebar) instead.
 */
function publicRoutes(home: React.ReactNode = <LandingPage />, withCatalog = true) {
  return (
    <Route element={<PublicLayout />}>
      <Route path={ROUTES.landing} element={home} />
      {withCatalog && <Route path={ROUTES.courses} element={<PublicCoursesPage />} />}
      {withCatalog && <Route path={ROUTES.courseDetail} element={<PublicCourseDetailPage />} />}
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

/**
 * "/" for a signed-in user. Opening the site on "/" (the entry location of
 * this page load) goes straight to the role dashboard; navigating to "/"
 * inside the app — e.g. the header logo — still shows the landing page.
 */
function SignedInHome({ isEntry }: { isEntry: boolean }) {
  const landing = useLandingPath();
  return isEntry ? <Navigate to={landing} replace /> : <LandingPage />;
}

function AppRoutes() {
  const { isLoading, isAuthenticated, user, reauthRequired, clearReauthRequired } = useAuth();
  const landing = useLandingPath();
  const location = useLocation();

  // Key of the location the page was loaded on. Every in-app navigation gets
  // a new key, so `location.key === entryKey` means "the user just opened
  // (or reloaded) this URL", not "clicked a link to it".
  const [entryKey] = useState(location.key);

  // A forced sign-out has landed on /login — the flag has done its job, so
  // the visitor can browse public pages again without bouncing back.
  useEffect(() => {
    if (reauthRequired && location.pathname === ROUTES.login) {
      clearReauthRequired();
    }
  }, [reauthRequired, location.pathname, clearReauthRequired]);

  // 1. Loading → no redirect, no layout flash. While a stored session is
  //    being verified (GET /users/me) we also stay here.
  if (isLoading) {
    return <LoadingScreen />;
  }

  // 2. Not authenticated → public pages render FULL-WIDTH (they manage
  //     their own responsive containers). Only the auth forms sit inside
  //     AuthLayout's narrow centered column.
  if (!isAuthenticated || user === null) {
    // Stored session rejected (token dead, or account changed on the server)
    // → straight to the login form, whatever page was requested.
    if (reauthRequired && location.pathname !== ROUTES.login) {
      const from = location.pathname === ROUTES.landing ? undefined : location.pathname + location.search;
      return <Navigate to={ROUTES.login} replace state={{ from, sessionChanged: true }} />;
    }

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

  const isStudent = user.role === Role.STUDENT;

  // 3. Authenticated → public pages keep the public shell (a student's catalog
  //     moves into the dashboard shell); the application
  //     screens render inside ONE DashboardLayout so the sidebar is mounted
  //     exactly once and persists across route changes.
  return (
    <Routes>
      {publicRoutes(<SignedInHome isEntry={location.key === entryKey} />, !isStudent)}

      {/* STUDENT — header (Home · Courses) + sidebar, like the other roles. */}
      <Route element={<DashboardLayout />}>
        <Route element={<RequireRole roles={ROLE_STUDENT} />}>
          <Route path={ROUTES.courses} element={<PublicCoursesPage />} />
          <Route path={ROUTES.courseDetail} element={<PublicCourseDetailPage />} />
          <Route path={ROUTES.studentPracticeExams} element={<StudentPracticeExamsPage />} />
          <Route path={ROUTES.studentProfile} element={<ProfilePage />} />
          <Route path={ROUTES.studentDashboard} element={<Navigate to={ROUTES.studentCourses} replace />} />
          <Route path={ROUTES.studentCourses} element={<MyCoursesPage />} />
          <Route path={ROUTES.studentCourseDetail} element={<StudentCourseDetailPage />} />
          <Route path={ROUTES.studentWeaknessReport} element={<StudentWeaknessReportPage />} />
          <Route path={ROUTES.studentExams} element={<MyExamsPage />} />
          <Route path={ROUTES.studentMyExams} element={<MyExamsPage />} />
          <Route path={ROUTES.studentLearningActivities} element={<StudentLearningActivityPage />} />
          <Route path={ROUTES.studentQuestionNotebook} element={<StudentQuestionNotebookPage />} />
          <Route path={ROUTES.studentContests} element={<StudentContestsPage />} />
          <Route path={ROUTES.studentContestDetail} element={<StudentContestsPage />} />
          <Route path={ROUTES.studentDiscussions} element={<StudentCommunityPage />} />
          <Route path={ROUTES.studentDiscussionDetail} element={<StudentCommunityPage />} />
          <Route path={ROUTES.studentContributions} element={<StudentContributionsPage />} />
          <Route path={ROUTES.studentContributionDetail} element={<StudentContributionsPage />} />
          <Route path={ROUTES.studentFlashcards} element={<StudentFlashcardsPage />} />
          <Route path={ROUTES.studentFlashcardDeck} element={<StudentDeckStudyPage />} />
          <Route path={ROUTES.studentPublicExam} element={<PublicExamsPage />} />
          <Route path={ROUTES.studentPublicExamDetail} element={<PublicExamDetailPage />} />
          <Route path={ROUTES.studentExamDetail} element={<StudentExamDetailPage />} />
          <Route path={ROUTES.studentExamResult} element={<StudentExamResultPage />} />
        </Route>
      </Route>

      <Route element={<RequireRole roles={ROLE_STUDENT} />}>
        <Route path={ROUTES.studentExam} element={<StudentTakeExamPage />} />
        <Route path={ROUTES.studentPractice} element={<StudentPracticeQuizPage />} />
      </Route>

      <Route element={<DashboardLayout />}>
        {/* Already signed in — respect ?redirect= before falling back. */}
        <Route path={ROUTES.login} element={<LoggedInLoginRedirect />} />
        <Route path={ROUTES.register} element={<Navigate to={landing} replace />} />
        <Route path={ROUTES.forgotPassword} element={<ForgotPasswordPage />} />
        <Route path={ROUTES.resetPassword} element={<ResetPasswordPage />} />

        {/* COURSE_MANAGER — authors content. Includes ADMIN, since
            administrators have full system access. */}
        <Route element={<RequireRole roles={ROLE_MANAGER} />}>
          <Route path={ROUTES.profile} element={<ProfilePage />} />
          <Route path={ROUTES.managerDashboard} element={<CMDashboard />} />
          <Route path={ROUTES.managerCourses} element={<CourseListPage />} />
          <Route path={ROUTES.managerCourseDetail} element={<CourseDetailPage />} />
          <Route path={ROUTES.managerQuestions} element={<QuestionBankPage />} />
          <Route path={ROUTES.managerQuestionCreate} element={<QuestionFormPage mode="create" />} />
          <Route path={ROUTES.managerQuestionEdit} element={<QuestionDetailPage />} />
          <Route path={ROUTES.managerExams} element={<ExamListPage />} />
          <Route path={ROUTES.managerExamQuizNew} element={<ExamFormPage formKind="QUIZ" mode="create" />} />
          <Route path={ROUTES.managerExamQuizEdit} element={<ExamFormPage formKind="QUIZ" mode="edit" />} />
          <Route path={ROUTES.managerExamEssayNew} element={<ExamFormPage formKind="ESSAY" mode="create" />} />
          <Route path={ROUTES.managerExamEssayEdit} element={<ExamFormPage formKind="ESSAY" mode="edit" />} />
          <Route path={ROUTES.managerExamDiagramNew} element={<ExamFormPage formKind="ESSAY" mode="create" />} />
          <Route path={ROUTES.managerExamDiagramEdit} element={<ExamFormPage formKind="ESSAY" mode="edit" />} />
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
          {/* Only administrators create courses; Course Managers edit their content. */}
          <Route path={ROUTES.managerCourseCreate} element={<CourseFormPage mode="create" />} />
          <Route path={ROUTES.adminUsers} element={<UsersPage />} />
          <Route path={`${ROUTES.adminUsers}/:userId`} element={<UserDetailPage />} />
          <Route path={ROUTES.adminCategories} element={<CategoriesPage />} />
          <Route path={ROUTES.adminSubscriptions} element={<SubscriptionPackagesPage />} />
          <Route path={ROUTES.adminAnalytics} element={<AnalyticsPage />} />
          <Route path={ROUTES.adminAuditLogs} element={<AuditLogsPage />} />
          <Route path={ROUTES.adminSettings} element={<SystemSettingsPage />} />
        </Route>

        {/* Fallback (404) — goes to the role landing, NOT /login (which
            would immediately bounce back here and could look like a
            logout). */}
        <Route path="*" element={<Navigate to={landing} replace />} />
      </Route>
    </Routes>
  );
}
