import React from 'react';
import { PopularCoursesSection } from '@/features/catalog';
import { HeroSection } from '../sections/HeroSection';
import { HowItWorksSection } from '../sections/HowItWorksSection';
import { FinalCtaSection } from '../sections/FinalCtaSection';

/**
 * LandingPage
 *
 * Public marketing page (no auth required), rendered inside PublicLayout
 * (header / main / footer).
 *
 * Content hierarchy:
 *   Header with course search
 *   → Hero (copy + answerable sample question)
 *   → Popular Courses
 *   → How it works (three steps with product visuals)
 *   → CTA
 *   → Footer
 *
 * The hero carries ONE sample question so visitors can try the practice →
 * explanation loop before signing up; full question sets stay inside courses.
 *
 * The hero's "Start practising free" CTA is auth-aware via useRequireAuth: guests are
 * redirected to login and continue to their dashboard afterwards.
 */
export function LandingPage() {
  return (
    <>
      <HeroSection />
      <PopularCoursesSection limit={6} />
      <HowItWorksSection />
      <FinalCtaSection />
    </>
  );
}