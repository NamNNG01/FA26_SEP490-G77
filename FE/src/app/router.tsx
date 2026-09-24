import React from 'react';
import CoverPage from '@/components/common/CoverPage';
import DesignSystemPage from '@/components/common/DesignSystemPage';
import ComponentsPage from '@/components/common/ComponentsPage';
import { ErrorPage, LoadingPage, EmptyStatePage } from '@/components/common';
import { LoginPage, ForgotPasswordPage, ResetPasswordPage } from '@/features/auth';
import { ProfilePage, SettingsPage } from '@/features/profile';
import { NotificationsPage } from '@/features/notification';
import { StudentDashboard, ExamRulesPage } from '@/features/student';
import { TakeExamPage, ExamResultPage, ExamListPage, ExamFormPage } from '@/features/exam';
import { CertificatesPage } from '@/features/certificate';
import { CMDashboard } from '@/features/content-manager';
import { QuestionBankPage, QuestionFormPage } from '@/features/question';
import { LessonFormPage } from '@/features/lesson';
import { ModuleDetailPage } from '@/features/module';
import { CourseListPage, CourseFormPage, CourseDetailPage } from '@/features/course';
import { AdminDashboard, UsersPage, UserDetailPage, FinancialDashboardPage, SubscriptionPackagesPage, AIUsagePage, AnalyticsPage, AuditLogsPage, SystemSettingsPage } from '@/features/admin';

export function renderPage(id: string, navigate: (id: string) => void, params?: Record<string, string>) {
  switch (id) {
    case 'cover': return <CoverPage />;
    case 'design-system': return <DesignSystemPage />;
    case 'components': return <ComponentsPage />;
    // Auth & Common
    case 'login': return <LoginPage onNavigate={navigate} />;
    case 'forgot-password': return <ForgotPasswordPage onNavigate={navigate} />;
    case 'reset-password': return <ResetPasswordPage />;
    case 'profile': return <ProfilePage />;
    case 'settings': return <SettingsPage />;
    case 'notifications': return <NotificationsPage />;
    case 'loading': return <LoadingPage />;
    case 'empty-state': return <EmptyStatePage />;
    case 'error-404': return <ErrorPage code={404} />;
    case 'error-500': return <ErrorPage code={500} />;
    // Student
    case 'student-dashboard': return <StudentDashboard />;
    case 'exam-rules': return <ExamRulesPage onStart={() => navigate('take-exam')} />;
    case 'take-exam': return <TakeExamPage />;
    case 'exam-result': return <ExamResultPage />;
    case 'certificates': return <CertificatesPage />;
    // Content Manager
    case 'cm-dashboard': return <CMDashboard onNavigate={navigate} />;
    case 'cm-courses': return <CourseListPage readonly onNavigate={navigate} />;
    case 'course-detail': return <CourseDetailPage onNavigate={navigate} />;
    case 'module-detail': return <ModuleDetailPage onNavigate={navigate} />;
    case 'question-bank': return <QuestionBankPage onNavigate={navigate} />;
    case 'question-create': return <QuestionFormPage mode="create" onNavigate={navigate} />;
    case 'question-edit': return <QuestionFormPage mode="edit" onNavigate={navigate} />;
    case 'exam-list': return <ExamListPage onNavigate={navigate} />;
    case 'exam-builder': return <ExamFormPage mode="create" onNavigate={navigate} />;
    case 'exam-create': return <ExamFormPage mode="create" onNavigate={navigate} />;
    case 'exam-edit': return <ExamFormPage mode="edit" onNavigate={navigate} />;
    case 'lesson-create': return <LessonFormPage mode="create" onNavigate={navigate} initialCourseId={params?.courseId} initialModuleId={params?.moduleId} />;
    case 'lesson-edit': return <LessonFormPage mode="edit" onNavigate={navigate} />;
    // Admin
    case 'admin-dashboard': return <AdminDashboard />;
    case 'course-list': return <CourseListPage onNavigate={navigate} />;
    case 'course-create': return <CourseFormPage mode="create" onNavigate={navigate} />;
    case 'course-edit': return <CourseFormPage mode="edit" onNavigate={navigate} />;
    case 'users': return <UsersPage onNavigate={navigate} />;
    case 'user-detail': return <UserDetailPage key={params?.userId ?? 'default'} onNavigate={navigate} params={params} />;
    case 'financial-dashboard': return <FinancialDashboardPage />;
    case 'subscription-packages': return <SubscriptionPackagesPage />;
    case 'ai-usage': return <AIUsagePage />;
    case 'analytics': return <AnalyticsPage />;
    case 'audit-logs': return <AuditLogsPage />;
    case 'system-settings': return <SystemSettingsPage />;
    default: return <div className="p-8 text-[#9CA3AF]">Page not found</div>;
  }
}
