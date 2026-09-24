import React from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router';
import { useAuth, landingPathForRole } from '@/auth/authContext';
import { AuthLayout } from '@/layouts/AuthLayout';
import { DashboardLayout } from '@/layouts/DashboardLayout';
import { LoadingScreen } from '@/components/LoadingScreen';

import { LoginPage } from '@/features/auth';
import { RegisterPage } from '@/features/auth/pages/RegisterPage';
import { ForgotPasswordPage, ResetPasswordPage } from '@/features/auth/pages/AuthPages';
import { ProfilePage } from '@/features/profile';
import { StudentDashboard } from '@/features/student';
import { TakeExamPage, ExamResultPage, ExamListPage } from '@/features/exam';
import { CMDashboard } from '@/features/content-manager';
import { QuestionBankPage } from '@/features/question';
import { CourseListPage } from '@/features/course';
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
 *  - unauthenticated → AuthLayout (login / register / forgot / reset).
 *  - authenticated   → ONE layout route: DashboardLayout renders the
 *                      header + role-filtered Sidebar and swaps pages via
 *                      <Outlet />, so the sidebar is mounted exactly once
 *                      and persists across route changes.
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
  return landingPathForRole(user?.role?.code);
}

function AppRoutes() {
  const { isLoading, isAuthenticated, user } = useAuth();
  const location = useLocation();
  const landing = useLandingPath();

  // 1. Loading → no redirect, no layout flash.
  if (isLoading) {
    return <LoadingScreen />;
  }

  // 2. Not authenticated → auth layout only.
  if (!isAuthenticated || user === null) {
    return (
      <AuthLayout>
        <Routes location={location}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthLayout>
    );
  }

  // 3. Authenticated → single layout route with nested pages via <Outlet />.
  return (
    <Routes>
      <Route element={<DashboardLayout />}>
        {/* Public routes still accessible to logged-in users */}
        <Route path="/login" element={<Navigate to={landing} replace />} />
        <Route path="/register" element={<Navigate to={landing} replace />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Role-based landing */}
        <Route path="/" element={<Navigate to={landing} replace />} />

        {/* Student */}
        <Route path="/student/dashboard" element={<StudentDashboard />} />
        <Route
          path="/student/courses"
          element={<CourseListPage readonly />}
        />
        <Route path="/student/exams" element={<ExamListPage />} />
        <Route path="/student/exam" element={<TakeExamPage />} />
        <Route path="/student/exam-result" element={<ExamResultPage />} />

        {/* Content Manager */}
        <Route path="/manager/dashboard" element={<CMDashboard />} />
        <Route path="/manager/courses" element={<CourseListPage />} />
        <Route path="/manager/questions" element={<QuestionBankPage />} />
        <Route path="/manager/exams" element={<ExamListPage />} />

        {/* Admin */}
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/users" element={<UsersPage />} />
        <Route path="/admin/users/:userId" element={<UserDetailPage />} />
        <Route path="/admin/financial" element={<FinancialDashboardPage />} />
        <Route
          path="/admin/subscriptions"
          element={<SubscriptionPackagesPage />}
        />
        <Route path="/admin/ai-usage" element={<AIUsagePage />} />
        <Route path="/admin/analytics" element={<AnalyticsPage />} />
        <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
        <Route path="/admin/settings" element={<SystemSettingsPage />} />

        {/* Common */}
        <Route path="/profile" element={<ProfilePage />} />

        {/* Fallback (404) — goes to the role landing, NOT /login (which
            would immediately bounce back here and could look like a
            logout). */}
        <Route path="*" element={<Navigate to={landing} replace />} />
      </Route>
    </Routes>
  );
}
