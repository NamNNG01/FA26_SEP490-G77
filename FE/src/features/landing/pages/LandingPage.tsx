import React from 'react';
import { PopularCoursesSection } from '@/features/catalog';
import { HeroSection } from '../sections/HeroSection';
import { FeaturesSection } from '../sections/FeaturesSection';
import { FinalCtaSection } from '../sections/FinalCtaSection';

/**
 * LandingPage
 *
 * Public marketing page (no auth required), rendered inside PublicLayout
 * (header / main / footer).
 *
 * Content hierarchy:
 *   Header with course search
 *   → Hero (copy + Featured Course card)
 *   → Popular Courses
 *   → Platform Benefits
 *   → CTA
 *   → Footer
 *
 * There is no question preview or multiple-choice sample on this page —
 * individual questions belong inside a course, not on the landing page.
 *
 * The hero's "Start Learning" CTA is auth-aware via useRequireAuth: guests are
 * redirected to login and continue to their dashboard afterwards.
 */
export function LandingPage() {
  return (
    <>
      <HeroSection />
      <PopularCoursesSection limit={6} />
      <FeaturesSection />
      <FinalCtaSection />
    </>
  );
}