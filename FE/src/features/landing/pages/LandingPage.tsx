import React from 'react';
import { useAuth, landingPathForRole } from '@/auth/authContext';
import { PublicNavbar } from '../components/PublicNavbar';
import { Container } from '../components/Container';
import { HeroSection } from '../sections/HeroSection';
import { StatisticsSection } from '../sections/StatisticsSection';
import { FeaturesSection } from '../sections/FeaturesSection';
import { TestimonialsSection } from '../sections/TestimonialsSection';
import { FinalCtaSection } from '../sections/FinalCtaSection';

/**
 * LandingPage
 *
 * Public marketing page (no auth required). The hero Primary CTA is
 * auth-aware: guests → /register; any authenticated user → their role
 * dashboard (via landingPathForRole).
 *
 * Scroll behavior: the app root sets `html/body { overflow: hidden }` and
 * DashboardLayout scrolls its own <main>. This page therefore opts out of
 * that constraint with `min-h-0 overflow-y-auto` so the whole document
 * scrolls normally — required for the viewport-enter Reveal animations.
 * `overflow-x-hidden` guarantees no horizontal scrolling.
 */
export function LandingPage() {
  const { isAuthenticated, user } = useAuth();

  const primaryCta = isAuthenticated
    ? { label: 'Go to My Dashboard', to: landingPathForRole(user?.role?.code) }
    : { label: 'Start Learning for Free', to: '/register' };

  return (
    <div className="h-full min-h-0 overflow-y-auto overflow-x-hidden bg-white dark:bg-[#111827]">
      <PublicNavbar primaryPath={primaryCta.to} />

      <main>
        <HeroSection primaryCta={primaryCta} />
        <StatisticsSection />
        <FeaturesSection />
        <TestimonialsSection />
        <FinalCtaSection />
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-[#111827] border-t border-[#F3F4F6] dark:border-[#1F2937]">
        <Container className="py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left min-w-0">
            <p className="text-[13px] text-[#9CA3AF]">
              © {new Date().getFullYear()} CertifyAI. All rights reserved.
            </p>
            <p className="text-[13px] text-[#9CA3AF]">
              AI-powered certification exam preparation
            </p>
          </div>
        </Container>
      </footer>
    </div>
  );
}
