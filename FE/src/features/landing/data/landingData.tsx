import { ROUTES } from '@/app/routes';

/**
 * Landing page content — single source of truth for every repeated UI
 * element. Sections render these arrays with map(), so copy and cards can
 * change without touching JSX.
 *
 * Course content comes from the backend through features/catalog — this
 * module only holds landing copy. The hero figures and eyebrow are computed
 * from the live catalog at render time (useCatalogOverview), never hard-coded.
 *
 * Copy rule: say something specific (a number, a format, a workflow step)
 * instead of a generic slogan.
 *
 * Navigation targets only use the central ROUTES registry — no hardcoded
 * URLs at call sites.
 */

// ---------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------
export const heroContent = {
  /** Eyebrow when the catalog has no categories to list. */
  eyebrowFallback: 'Certification exam preparation',
  title: 'Sit the exam before the exam.',
  subtitle:
    'Exam-style questions and full-length timed mocks for cloud and security certifications. After every attempt you see which topics cost you points, and why.',
  primaryCta: { label: 'Browse courses', to: ROUTES.courses },
  secondaryCtaLabel: 'Start practising free',
};

/** The interactive sample question shown in the hero. */
export const sampleQuestion = {
  course: 'AWS Certified Cloud Practitioner',
  topic: 'Compute & Storage',
  position: 'Question 14 of 65',
  prompt:
    'A startup wants to run code only when an order is placed, pay nothing while idle, and manage no servers. Which AWS service fits best?',
  options: [
    { id: 'A', text: 'Amazon EC2 Reserved Instances' },
    { id: 'B', text: 'AWS Lambda' },
    { id: 'C', text: 'Amazon Lightsail' },
    { id: 'D', text: 'AWS Outposts' },
  ],
  correctId: 'B',
  explanation:
    'Lambda runs your code on demand and bills per millisecond of execution, so idle time costs nothing and there are no servers to patch. Reserved Instances and Lightsail are always-on servers; Outposts is on-premises hardware.',
};

// ---------------------------------------------------------------------
// How it works — three steps, each paired with a small product visual
// ---------------------------------------------------------------------
export type HowItWorksVisual = 'topics' | 'mock' | 'review';

export interface HowItWorksStep {
  step: string;
  title: string;
  description: string;
  visual: HowItWorksVisual;
}

export const howItWorksContent = {
  eyebrow: 'How it works',
  title: 'From your first practice set to exam day',
  subtitle: 'Three habits that move a score, in the order most people need them.',
};

export const howItWorksSteps: HowItWorksStep[] = [
  {
    step: '01',
    title: 'Practise one topic at a time',
    description:
      'Work through a single exam domain before mixing them. Every answer comes with an explanation, so a wrong answer still teaches you something.',
    visual: 'topics',
  },
  {
    step: '02',
    title: 'Sit a full, timed mock exam',
    description:
      'Same length, same timer and the same question mix as the real exam. Flag what you are unsure of and come back to it, exactly as you would on test day.',
    visual: 'mock',
  },
  {
    step: '03',
    title: 'Fix what is costing you points',
    description:
      'Results are broken down by topic. AI review walks through the questions you missed and tells you what to study before the next attempt.',
    visual: 'review',
  },
];

/** Smaller capabilities that don't need their own block. */
export const alsoIncluded = ['Flashcards built from each course', 'Readiness score per exam', 'Practice streaks'];

// ---------------------------------------------------------------------
// Final CTA
// ---------------------------------------------------------------------
export const finalCtaContent = {
  title: 'Your first practice set takes about 15 minutes.',
  subtitle:
    'Free account, no card required. PrepExam is a preparation platform. It does not issue certificates; you sit the official exam with the provider.',
  primaryCta: { label: 'Create free account', to: ROUTES.register },
  secondaryCta: { label: 'View pricing', to: ROUTES.pricing },
};
