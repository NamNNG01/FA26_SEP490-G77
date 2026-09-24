import React from 'react';
import { Icon } from '@/assets/icons';

/**
 * Central route registry — single source of truth for navigation paths.
 * Components import from here instead of hardcoding URLs.
 */
export const ROUTES = {
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  profile: '/profile',

  // Student
  studentDashboard: '/student/dashboard',
  studentCourses: '/student/courses',
  studentExams: '/student/exams',
  studentExam: '/student/exam',
  studentExamResult: '/student/exam-result',

  // Content Manager (backend role: COURSE_MANAGER)
  managerDashboard: '/manager/dashboard',
  managerCourses: '/manager/courses',
  managerQuestions: '/manager/questions',
  managerExams: '/manager/exams',

  // Admin
  adminDashboard: '/admin/dashboard',
  adminUsers: '/admin/users',
  adminFinancial: '/admin/financial',
  adminSubscriptions: '/admin/subscriptions',
  adminAiUsage: '/admin/ai-usage',
  adminAnalytics: '/admin/analytics',
  adminAuditLogs: '/admin/audit-logs',
  adminSettings: '/admin/settings',
} as const;

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
    { id: 'student-dashboard', title: 'Dashboard', icon: <Icon.Home className="w-4 h-4" />, path: ROUTES.studentDashboard },
    { id: 'student-courses', title: 'My Courses', icon: <Icon.Book className="w-4 h-4" />, path: ROUTES.studentCourses },
    { id: 'student-exams', title: 'My Exams', icon: <Icon.ClipboardList className="w-4 h-4" />, path: ROUTES.studentExams },
  ],
  COURSE_MANAGER: [
    { id: 'manager-dashboard', title: 'Dashboard', icon: <Icon.Home className="w-4 h-4" />, path: ROUTES.managerDashboard },
    { id: 'manager-courses', title: 'Courses', icon: <Icon.Book className="w-4 h-4" />, path: ROUTES.managerCourses },
    { id: 'manager-questions', title: 'Question Bank', icon: <Icon.Database className="w-4 h-4" />, path: ROUTES.managerQuestions },
    { id: 'manager-exams', title: 'Exams', icon: <Icon.ClipboardList className="w-4 h-4" />, path: ROUTES.managerExams },
  ],
  ADMIN: [
    { id: 'admin-dashboard', title: 'Dashboard', icon: <Icon.Home className="w-4 h-4" />, path: ROUTES.adminDashboard },
    { id: 'admin-users', title: 'User Management', icon: <Icon.Users className="w-4 h-4" />, path: ROUTES.adminUsers },
    { id: 'admin-financial', title: 'Financial', icon: <Icon.TrendingUp className="w-4 h-4" />, path: ROUTES.adminFinancial },
    { id: 'admin-subscriptions', title: 'Subscriptions', icon: <Icon.Package className="w-4 h-4" />, path: ROUTES.adminSubscriptions },
    { id: 'admin-ai-usage', title: 'AI Usage', icon: <Icon.Brain className="w-4 h-4" />, path: ROUTES.adminAiUsage },
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
