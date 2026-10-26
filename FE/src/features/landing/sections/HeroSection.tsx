import React from 'react';
import { ROUTES } from '@/app/routes';
import { Container } from '../components/Container';
import { CTAButton } from '../components/CTAButton';
import { SampleQuestionCard } from '../components/SampleQuestionCard';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { useCatalogOverview } from '@/features/catalog';
import { heroContent } from '../data/landingData';

/** Category names shown in the eyebrow before it gets too long. */
const EYEBROW_MAX_CATEGORIES = 5;

/**
 * HeroSection
 *
 * Two columns: the value proposition and CTAs on the left, an answerable
 * sample question on the right. The question replaces the old Featured
 * Course card (that course already leads the Popular Courses grid below):
 * showing the practice → explanation loop does more than describing it.
 *
 * CTAs:
 *  - "Browse courses" → /courses, open to guests.
 *  - "Start practising free" → requires an account; guests are sent to
 *    /login?redirect=/student/courses and continue after signing in.
 *
 * Below the CTAs, live catalog figures (courses, mock exams, categories —
 * useCatalogOverview) replace generic trust badges.
 *
 * No scroll-reveal here: the hero is above the fold, so it renders at once.
 *
 * Fluid CSS Grid hero — zoom-safe, no fixed columns:
 *   grid-template-columns: repeat(auto-fit, minmax(350px, 1fr))
 */
export function HeroSection() {
  const requireAuth = useRequireAuth();
  const overview = useCatalogOverview();

  const eyebrow =
    overview && overview.categoryNames.length > 0
      ? overview.categoryNames.slice(0, EYEBROW_MAX_CATEGORIES).join(' · ')
      : heroContent.eyebrowFallback;

  // "—" until the catalog answers, so the hero never shows a made-up number.
  const show = (n: number | undefined) => (n == null ? '—' : n.toLocaleString('en-US'));
  const catalogStats = [
    { value: show(overview?.courseCount), label: 'courses' },
    { value: show(overview?.examCount), label: 'timed mock exams' },
    { value: show(overview?.categoryNames.length), label: 'categories' },
  ];

  return (
    <section className="relative overflow-hidden border-b border-line-soft">
      {/* Faint ruled-paper texture — a nod to an answer sheet, not a glow blob. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5] [background-image:linear-gradient(to_bottom,rgb(13_124_108/0.06)_1px,transparent_1px)] [background-size:100%_32px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)] dark:opacity-[0.35]"
      />

      <div className="relative">
        <Container>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(350px,1fr))] items-center gap-[clamp(32px,4vw,64px)] py-[clamp(3rem,7vw,6rem)]">
            <div className="min-w-0 text-center min-[900px]:text-left">
              <div>
                <p className="text-xs font-semibold tracking-[0.08em] text-brand-ink uppercase">
                  {eyebrow}
                </p>
              </div>

              <div>
                <h1 className="mt-4 text-[clamp(2.4rem,1.4rem+4vw,4.5rem)] leading-[1.02] font-bold text-content">
                  {heroContent.title}
                </h1>
              </div>

              <div>
                <p className="mx-auto mt-[clamp(1.25rem,2.5vw,1.75rem)] max-w-[min(560px,100%)] text-[clamp(1rem,0.95rem+0.3vw,1.125rem)] leading-relaxed text-content-muted min-[900px]:mx-0">
                  {heroContent.subtitle}
                </p>
              </div>

              <div>
                <div className="mt-[clamp(1.5rem,3vw,2.25rem)] flex flex-wrap justify-center gap-3 min-[900px]:justify-start">
                  <CTAButton
                    label={heroContent.primaryCta.label}
                    to={heroContent.primaryCta.to}
                    withArrow
                    className="w-full sm:w-auto"
                  />
                  <CTAButton
                    label={heroContent.secondaryCtaLabel}
                    onClick={() => requireAuth(ROUTES.studentCourses)}
                    variant="secondary"
                    className="w-full sm:w-auto"
                  />
                </div>
              </div>

              <div>
                <dl className="mt-[clamp(2rem,3.5vw,2.75rem)] flex flex-wrap justify-center gap-x-8 gap-y-4 min-[900px]:justify-start">
                  {catalogStats.map((stat) => (
                    // Label first in the DOM (dt → dd), number shown on top visually.
                    <div key={stat.label} className="flex flex-col-reverse text-left">
                      <dt className="mt-1.5 text-sm text-content-soft">{stat.label}</dt>
                      <dd className="font-[family-name:var(--font-display)] text-2xl leading-none font-bold text-content">
                        {stat.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            <div className="flex justify-center min-[900px]:justify-end">
              <SampleQuestionCard />
            </div>
          </div>
        </Container>
      </div>
    </section>
  );
}
