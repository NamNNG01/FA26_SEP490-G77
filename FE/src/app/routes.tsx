import React from 'react';
import { Icon } from '@/assets/icons';

export const NAV = [
  {
    id: 'cover',
    section: 'Overview',
    icon: <Icon.Layers className="w-4 h-4" />,
    label: 'Cover',
    page: 'Cover',
    showInNav: true,
  },
  {
    id: 'design-system',
    section: 'Overview',
    icon: <Icon.Grid className="w-4 h-4" />,
    label: 'Design System',
    page: 'Design System',
    showInNav: true,
  },
  {
    id: 'components',
    section: 'Overview',
    icon: <Icon.Package className="w-4 h-4" />,
    label: 'Components',
    page: 'Components',
    showInNav: true,
  },
];

export const SECTIONS: { id: string; label: string; color: string; icon: React.ReactNode; items: { id: string; label: string; icon: React.ReactNode }[] }[] = [
  {
    id: 'common', label: 'Common', color: '#059669', icon: <Icon.Shield className="w-4 h-4" />,
    items: [
      { id: 'login', label: 'Login', icon: <Icon.Lock className="w-4 h-4" /> },
      { id: 'forgot-password', label: 'Forgot Password', icon: <Icon.Mail className="w-4 h-4" /> },
      { id: 'reset-password', label: 'Reset Password', icon: <Icon.Lock className="w-4 h-4" /> },
      { id: 'profile', label: 'Profile', icon: <Icon.User className="w-4 h-4" /> },
      { id: 'settings', label: 'Settings', icon: <Icon.Settings className="w-4 h-4" /> },
      { id: 'notifications', label: 'Notifications', icon: <Icon.Bell className="w-4 h-4" /> },
      { id: 'loading', label: 'Loading', icon: <Icon.RefreshCw className="w-4 h-4" /> },
      { id: 'empty-state', label: 'Empty State', icon: <Icon.FileText className="w-4 h-4" /> },
      { id: 'error-404', label: 'Error 404', icon: <Icon.AlertCircle className="w-4 h-4" /> },
      { id: 'error-500', label: 'Error 500', icon: <Icon.AlertCircle className="w-4 h-4" /> },
    ],
  },
  {
    id: 'student', label: 'Student', color: '#D97706', icon: <Icon.Book className="w-4 h-4" />,
    items: [
      { id: 'student-dashboard', label: 'Dashboard', icon: <Icon.Home className="w-4 h-4" /> },
      { id: 'exam-rules', label: 'Exam Rules', icon: <Icon.Shield className="w-4 h-4" /> },
      { id: 'take-exam', label: 'Take Exam', icon: <Icon.ClipboardList className="w-4 h-4" /> },
      { id: 'exam-result', label: 'Exam Result', icon: <Icon.Trophy className="w-4 h-4" /> },
      { id: 'certificates', label: 'Certificates', icon: <Icon.Award className="w-4 h-4" /> },
    ],
  },
  {
    id: 'content-manager', label: 'Content Manager', color: '#0891B2', icon: <Icon.FileText className="w-4 h-4" />,
    items: [
      { id: 'cm-dashboard', label: 'Dashboard', icon: <Icon.Home className="w-4 h-4" /> },
      { id: 'cm-courses', label: 'Courses', icon: <Icon.Book className="w-4 h-4" /> },
      { id: 'question-bank', label: 'Question', icon: <Icon.Database className="w-4 h-4" /> },
      { id: 'exam-list', label: 'Exams', icon: <Icon.ClipboardList className="w-4 h-4" /> },
    ],
  },
  {
    id: 'admin', label: 'Admin', color: '#DC2626', icon: <Icon.Cpu className="w-4 h-4" />,
    items: [
      { id: 'admin-dashboard', label: 'Dashboard', icon: <Icon.Home className="w-4 h-4" /> },
      { id: 'course-list', label: 'Courses', icon: <Icon.Book className="w-4 h-4" /> },
      { id: 'users', label: 'User List', icon: <Icon.Users className="w-4 h-4" /> },
      { id: 'financial-dashboard', label: 'Financial', icon: <Icon.TrendingUp className="w-4 h-4" /> },
      { id: 'subscription-packages', label: 'Subscriptions', icon: <Icon.Package className="w-4 h-4" /> },
      { id: 'ai-usage', label: 'AI Usage', icon: <Icon.Brain className="w-4 h-4" /> },
      { id: 'analytics', label: 'Analytics', icon: <Icon.BarChart className="w-4 h-4" /> },
      { id: 'audit-logs', label: 'Audit Logs', icon: <Icon.Activity className="w-4 h-4" /> },
      { id: 'system-settings', label: 'System Settings', icon: <Icon.Settings className="w-4 h-4" /> },
    ],
  },
];

export const FULLSCREEN = new Set(['login', 'forgot-password', 'reset-password', 'loading', 'empty-state', 'error-404', 'error-500', 'take-exam', 'cover']);
