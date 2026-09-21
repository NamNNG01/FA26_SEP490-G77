import React from 'react';
import CoverPage from '@/components/common/CoverPage';
import DesignSystemPage from '@/components/common/DesignSystemPage';
import ComponentsPage from '@/components/common/ComponentsPage';
import { ErrorPage, LoadingPage, EmptyStatePage } from '@/components/common';
import { LoginPage, ForgotPasswordPage, ResetPasswordPage } from '@/features/auth';
import { ProfilePage, SettingsPage } from '@/features/profile';
import { NotificationsPage } from '@/features/notification';
import { StudentDashboard, ExamRulesPage } from '@/features/student';
import { TakeExamPage, ExamResultPage, ExamBuilderPage } from '@/features/exam';
import { CertificatesPage } from '@/features/certificate';
import { CMDashboard, OCRImportPage } from '@/features/content-manager';
import { QuestionBankPage } from '@/features/question';
import { AdminDashboard, UsersPage, AnalyticsPage, AuditLogsPage, SystemSettingsPage } from '@/features/admin';

export function renderPage(id: string, navigate: (id: string) => void) {
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
    case 'cm-dashboard': return <CMDashboard />;
    case 'question-bank': return <QuestionBankPage />;
    case 'exam-builder': return <ExamBuilderPage />;
    case 'ocr-import': return <OCRImportPage />;
    // Admin
    case 'admin-dashboard': return <AdminDashboard />;
    case 'users': return <UsersPage />;
    case 'analytics': return <AnalyticsPage />;
    case 'audit-logs': return <AuditLogsPage />;
    case 'system-settings': return <SystemSettingsPage />;
    default: return <div className="p-8 text-[#9CA3AF]">Page not found</div>;
  }
}
