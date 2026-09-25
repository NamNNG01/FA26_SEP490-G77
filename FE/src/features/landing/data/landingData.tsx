import type { ReactNode } from 'react';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';

/**
 * Landing page content — single source of truth for every repeated UI
 * element. Sections render these arrays with map(), so copy, metrics and
 * cards can change without touching JSX.
 *
 * Navigation targets only use the central ROUTES registry — no hardcoded
 * URLs at call sites.
 */

// ---------------------------------------------------------------------
// Platform statistics (4 cards)
// ---------------------------------------------------------------------
export interface LandingStat {
  icon: ReactNode;
  value: string;
  label: string;
  /** Accent color — used for the tinted icon chip. */
  color: string;
}

export const landingStats: LandingStat[] = [
  { icon: <Icon.Users className="w-6 h-6" />, value: '12,500+', label: 'Active Learners', color: '#2563EB' },
  { icon: <Icon.TrendingUp className="w-6 h-6" />, value: '94%', label: 'Pass Rate', color: '#16A34A' },
  { icon: <Icon.ClipboardList className="w-6 h-6" />, value: '85,000+', label: 'Exams Completed', color: '#7C3AED' },
  { icon: <Icon.Award className="w-6 h-6" />, value: '23,000+', label: 'Certificates Issued', color: '#D97706' },
];

// ---------------------------------------------------------------------
// Feature cards (rendered from this array)
// ---------------------------------------------------------------------
export interface LandingFeature {
  icon: ReactNode;
  title: string;
  description: string;
  color: string;
}

export const landingFeatures: LandingFeature[] = [
  {
    icon: <Icon.Brain className="w-5.5 h-5.5" />,
    title: 'AI-Generated Practice Exams',
    description:
      'Unlimited mock exams generated from real course content, tuned to your strengths and weaknesses.',
    color: '#2563EB',
  },
  {
    icon: <Icon.ClipboardList className="w-5.5 h-5.5" />,
    title: 'Realistic Exam Simulator',
    description:
      'Timed, exam-day conditions with a question palette, flagging and instant scoring.',
    color: '#7C3AED',
  },
  {
    icon: <Icon.Lightbulb className="w-5.5 h-5.5" />,
    title: 'Detailed Explanations',
    description:
      'Every question comes with a clear, AI-written explanation so you learn from every mistake.',
    color: '#D97706',
  },
  {
    icon: <Icon.BarChart className="w-5.5 h-5.5" />,
    title: 'Progress Analytics',
    description:
      'Track scores, spot weak topics and watch your readiness climb over time.',
    color: '#0891B2',
  },
  {
    icon: <Icon.Zap className="w-5.5 h-5.5" />,
    title: 'Smart Study Recommendations',
    description:
      'CertifyAI tells you exactly what to review next based on your latest attempts.',
    color: '#DC2626',
  },
  {
    icon: <Icon.Award className="w-5.5 h-5.5" />,
    title: 'Recognized Certificates',
    description:
      'Earn verifiable certificates for every exam you pass and share them with employers.',
    color: '#16A34A',
  },
];

// ---------------------------------------------------------------------
// Testimonial cards (rendered from this array)
// ---------------------------------------------------------------------
export interface LandingTestimonial {
  /** Star rating 0–5. */
  rating: number;
  /** Exam score shown as a badge on the card. */
  scoreBadge: string;
  quote: string;
  name: string;
  role: string;
}

export const landingTestimonials: LandingTestimonial[] = [
  {
    rating: 5,
    scoreBadge: 'Score: 92%',
    quote:
      'The AI practice exams felt harder than the real thing — by exam day nothing surprised me. Passed on my first attempt with room to spare.',
    name: 'Sarah Chen',
    role: 'Cloud Solutions Architect',
  },
  {
    rating: 5,
    scoreBadge: 'Score: 88%',
    quote:
      'I loved how the platform told me exactly which topics to review after every mock exam. Three weeks of focused study and I was ready.',
    name: 'Marcus Rivera',
    role: 'DevOps Engineer',
  },
  {
    rating: 4,
    scoreBadge: 'Score: 95%',
    quote:
      'The detailed explanations are gold. I finally understood why answers were right instead of just memorizing patterns.',
    name: 'Amina Yusuf',
    role: 'Data Analyst',
  },
];

// ---------------------------------------------------------------------
// Interactive exam preview (sample question — not scored)
// ---------------------------------------------------------------------
export const previewExam = {
  examTitle: 'AWS Certified Cloud Practitioner',
  questionNumber: 3,
  totalQuestions: 20,
  /** Countdown for the preview widget, in seconds (10:00). */
  durationSeconds: 600,
  question:
    'Which AWS service provides a fully managed, serverless data warehouse that supports analytics workloads with petabyte-scale storage?',
  options: [
    { label: 'A', text: 'Amazon Redshift' },
    { label: 'B', text: 'Amazon DynamoDB' },
    { label: 'C', text: 'Amazon S3' },
    { label: 'D', text: 'AWS Lambda' },
  ],
};

// ---------------------------------------------------------------------
// Hero & final CTA copy (navigation targets stay dynamic — they depend on
// the auth state, see usePrimaryCtaPath)
// ---------------------------------------------------------------------
export const heroContent = {
  badge: 'AI-Powered Certification Prep',
  title: 'Pass Your Certification Exams with Confidence',
  subtitle:
    'CertifyAI generates realistic practice exams, tracks your progress and tells you exactly what to study next — so you walk into exam day fully prepared.',
  secondaryCta: { label: 'Explore Certification Exams', to: ROUTES.examsIntro },
  trustPoints: ['Free to start', 'No credit card required', 'Cancel anytime'],
};

export const statsSectionContent = {
  title: 'Trusted by Learners Worldwide',
  subtitle: 'Real numbers from a community that studies smarter, not longer.',
};

export const featuresSectionContent = {
  title: 'Everything You Need to Pass',
  subtitle:
    'A complete AI-powered toolkit that takes you from your first practice question to a recognized certificate.',
};

export const testimonialsSectionContent = {
  title: 'Loved by Thousands of Learners',
  subtitle: 'Hear from professionals who passed their certification exams with CertifyAI.',
};

export const finalCtaContent = {
  title: 'Ready to Get Certified?',
  subtitle:
    'Join thousands of learners who passed their certification exams with CertifyAI. Create your free account and take the first practice exam today.',
  secondaryCta: { label: 'View Pricing', to: ROUTES.pricing },
};
