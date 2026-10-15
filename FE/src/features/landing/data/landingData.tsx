import type { ReactNode } from 'react';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';

/**
 * Landing page content — single source of truth for every repeated UI
 * element. Sections render these arrays with map(), so copy and cards can
 * change without touching JSX.
 *
 * Course content itself lives in features/catalog (data/publicCourses.ts) —
 * this module only holds landing copy.
 *
 * Navigation targets only use the central ROUTES registry — no hardcoded
 * URLs at call sites.
 */

// ---------------------------------------------------------------------
// Platform benefits (rendered from this array)
// ---------------------------------------------------------------------
export interface LandingFeature {
  icon: ReactNode;
  title: string;
  description: string;
  color: string;
}

export const landingFeatures: LandingFeature[] = [
  {
    icon: <Icon.ClipboardList className="w-5.5 h-5.5" />,
    title: 'Real Exam-Style Questions',
    description:
      'Practise questions that mirror the real exam format, weighting and difficulty across every supported provider.',
    color: '#2563EB',
  },
  {
    icon: <Icon.Clock className="w-5.5 h-5.5" />,
    title: 'Full Mock Exams',
    description: 'Timed, exam-length mock exams with a question palette, flagging for review and instant scoring.',
    color: '#7C3AED',
  },
  {
    icon: <Icon.Brain className="w-5.5 h-5.5" />,
    title: 'AI-Powered Review',
    description: 'After every attempt, AI explains what you missed and which topics to review next.',
    color: '#0891B2',
  },
  {
    icon: <Icon.BarChart className="w-5.5 h-5.5" />,
    title: 'Weak-Area Tracking',
    description: 'Score by topic over time so you can see exactly which areas still need work.',
    color: '#16A34A',
  },
  {
    icon: <Icon.Layers className="w-5.5 h-5.5" />,
    title: 'Flashcards & Drills',
    description: 'Reinforce terminology and definitions with quick flashcards built from each course.',
    color: '#D97706',
  },
  {
    icon: <Icon.TrendingUp className="w-5.5 h-5.5" />,
    title: 'Readiness Tracking',
    description: 'Follow practice streaks and readiness signals so you know when to sit the real exam.',
    color: '#DC2626',
  },
];

// ---------------------------------------------------------------------
// Hero & final CTA copy
// ---------------------------------------------------------------------
export const heroContent = {
  badge: 'AI-Powered Exam Preparation Platform',
  title: 'Prepare Smarter. Perform Better.',
  subtitle:
    'Practice real exam-style questions, take mock exams, and improve weak areas with AI-powered learning tools.',
  primaryCta: { label: 'Browse Courses', to: ROUTES.courses },
  secondaryCtaLabel: 'Start Learning',
  trustPoints: ['No account needed to browse', 'Free to start', 'No credit card required'],
};

export const featuresSectionContent = {
  title: 'Platform Benefits',
  subtitle: 'Everything you need to turn exam anxiety into exam-day readiness.',
};

export const finalCtaContent = {
  title: 'Ready to Start Preparing?',
  subtitle:
    'Create a free account, pick a course and run your first practice set today. PrepExam is a preparation platform — it does not issue certificates.',
  secondaryCta: { label: 'View Pricing', to: ROUTES.pricing },
};