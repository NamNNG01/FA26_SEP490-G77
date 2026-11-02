import React from 'react';
import { PopularCoursesSection } from '@/features/catalog';
import { HeroSection } from '../sections/HeroSection';
import { HowItWorksSection } from '../sections/HowItWorksSection';

/**
 * LandingPage
 *
 * Public marketing page (no auth required), rendered inside PublicLayout
 * (header / main / footer).
 *
 * Content hierarchy:
 *   Header with course search
 *   → Hero (copy + CTAs + live catalog figures)
 *   → Popular Courses
 *   → How it works (three steps with product visuals)
 *   → Footer
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
    </>
  );
}