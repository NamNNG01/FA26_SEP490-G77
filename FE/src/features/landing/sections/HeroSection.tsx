import React from 'react';
import { Icon } from '@/assets/icons';
import { ROUTES } from '@/app/routes';
import { Container } from '../components/Container';
import { CTAButton } from '../components/CTAButton';
import { Reveal } from '@/components/common/Reveal';
import { FeaturedCourseCard } from '@/features/catalog';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { heroContent } from '../data/landingData';

/**
 * HeroSection
 *
 * Two columns: the value proposition and CTAs on the left, a single Featured
 * Course card on the right. There is deliberately NO exam question here — the
 * landing page leads with course discovery, not with a sample question.
 *
 * CTAs:
 *  - "Browse Courses" → /courses, open to guests.
 *  - "Start Learning" → requires an account; guests are sent to
 *    /login?redirect=/student/dashboard and continue after signing in.
 *
 * Fluid CSS Grid hero — zoom-safe, no fixed columns:
 *
 *   grid-template-columns: repeat(auto-fit, minmax(350px, 1fr))
 *
 * All typography and spacing use clamp() so the section scales smoothly.
 */
export function HeroSection() {
  const requireAuth = useRequireAuth();

  return (
    <section className="relative overflow-hidden">
      {/* Soft brand glow behind the hero (decorative only, not layout) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#EFF6FF] via-white to-white dark:from-[#0B1220] dark:via-[#111827] dark:to-[#111827]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 h-[480px] w-[480px] rounded-full bg-[#2563EB]/8 blur-3xl"
      />

      <div className="relative">
        <Container>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(350px,1fr))] items-center gap-[clamp(32px,4vw,64px)] py-[clamp(3rem,7vw,6rem)]">
            {/* Copy + CTAs — centered below ~900px, left-aligned beside the card */}
            <div className="min-w-0 text-center min-[900px]:text-left">
              <Reveal>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EFF6FF] px-3 py-1 text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] font-semibold text-[#2563EB] dark:bg-[#2563EB]/15 dark:text-[#93C5FD]">
                  <Icon.Zap className="h-3.5 w-3.5" />
                  {heroContent.badge}
                </span>
              </Reveal>

              {/* Fluid display typography — wraps naturally, never clipped */}
              <Reveal delay={80}>
                <h1 className="mt-[clamp(1rem,2vw,1.5rem)] text-[clamp(2.25rem,1.3rem+4vw,4.5rem)] leading-[1.05] font-extrabold tracking-tight text-[#111827] dark:text-[#F9FAFB]">
                  {heroContent.title}
                </h1>
              </Reveal>

              {/* Readable measure — fluid max-width */}
              <Reveal delay={160}>
                <p className="mx-auto mt-[clamp(1.25rem,2.5vw,2rem)] max-w-[min(600px,100%)] text-[clamp(1rem,0.95rem+0.3vw,1.125rem)] leading-relaxed text-[#6B7280] min-[900px]:mx-0 dark:text-[#D1D5DB]">
                  {heroContent.subtitle}
                </p>
              </Reveal>

              {/* Buttons: full-width stacked on narrow screens, row when wide */}
              <Reveal delay={240}>
                <div className="mt-[clamp(1.5rem,3vw,2.5rem)] flex flex-wrap justify-center gap-4 min-[900px]:justify-start">
                  <CTAButton
                    label={heroContent.primaryCta.label}
                    to={heroContent.primaryCta.to}
                    withArrow
                    className="w-full sm:w-auto"
                  />
                  <CTAButton
                    label={heroContent.secondaryCtaLabel}
                    onClick={() => requireAuth(ROUTES.studentDashboard)}
                    variant="secondary"
                    className="w-full sm:w-auto"
                  />
                </div>
              </Reveal>

              <Reveal delay={320}>
                <div className="mt-[clamp(1.5rem,2.5vw,2rem)] flex flex-wrap items-center justify-center gap-x-5 gap-y-2 min-[900px]:justify-start">
                  {heroContent.trustPoints.map((point) => (
                    <span
                      key={point}
                      className="inline-flex items-center gap-1.5 text-[clamp(0.8125rem,0.78rem+0.2vw,0.875rem)] text-[#6B7280] dark:text-[#9CA3AF]"
                    >
                      <Icon.CheckCircle className="h-4 w-4 flex-shrink-0 text-[#16A34A]" />
                      {point}
                    </span>
                  ))}
                </div>
              </Reveal>
            </div>

            {/* Featured course — grid item, vertically centered */}
            <div className="flex justify-center min-[900px]:justify-end">
              <FeaturedCourseCard />
            </div>
          </div>
        </Container>
      </div>
    </section>
  );
}