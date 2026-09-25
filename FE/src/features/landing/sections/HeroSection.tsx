import React from 'react';
import { Icon } from '@/assets/icons';
import { Container } from '../components/Container';
import { CTAButton } from '../components/CTAButton';
import { ExamPreviewCard } from '../components/ExamPreviewCard';
import { Reveal } from '../components/Reveal';
import { heroContent } from '../data/landingData';

/**
 * HeroSection
 *
 * Fluid CSS Grid hero — zoom-safe, no fixed columns:
 *
 *   grid-template-columns: repeat(auto-fit, minmax(350px, 1fr))
 *
 * Two balanced columns when ≥ ~700px of content width (auto-fit), a single
 * centered column below. Grid items never overlap. All typography and
 * spacing use clamp() so the section scales smoothly at 80–150% zoom.
 */
export function HeroSection({ primaryCta }: { primaryCta: { label: string; to: string } }) {
  return (
    <section className="relative overflow-hidden">
      {/* Soft brand glow behind the hero (decorative only, not layout) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#EFF6FF] via-white to-white dark:from-[#0B1220] dark:via-[#111827] dark:to-[#111827]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-32 w-[480px] h-[480px] rounded-full bg-[#2563EB]/8 blur-3xl"
      />

      <div className="relative">
        <Container>
          {/* auto-fit: 2 balanced columns when wide, 1 column when narrow —
              gap is fluid: clamp(32px, 4vw, 64px). */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(350px,1fr))] items-center gap-[clamp(32px,4vw,64px)] py-[clamp(3rem,7vw,6rem)]">
            {/* Copy + CTAs — centered below ~700px, left-aligned beside the card */}
            <div className="text-center min-[900px]:text-left min-w-0">
              <Reveal>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[clamp(0.75rem,0.7rem+0.25vw,0.875rem)] font-semibold bg-[#EFF6FF] dark:bg-[#2563EB]/15 text-[#2563EB] dark:text-[#93C5FD]">
                  <Icon.Zap className="w-3.5 h-3.5" />
                  {heroContent.badge}
                </span>
              </Reveal>

              {/* Fluid display typography — wraps naturally, never clipped */}
              <Reveal delay={80}>
                <h1 className="text-[clamp(2.5rem,1.4rem+4.5vw,5.8rem)] font-extrabold text-[#111827] dark:text-[#F9FAFB] leading-[1.05] tracking-tight mt-[clamp(1rem,2vw,1.5rem)]">
                  {heroContent.title}
                </h1>
              </Reveal>

              {/* Readable measure — fluid max-width */}
              <Reveal delay={160}>
                <p className="text-[clamp(1rem,0.95rem+0.3vw,1.125rem)] text-[#6B7280] dark:text-[#D1D5DB] leading-relaxed mt-[clamp(1.25rem,2.5vw,2rem)] max-w-[min(600px,100%)] mx-auto min-[900px]:mx-0">
                  {heroContent.subtitle}
                </p>
              </Reveal>

              {/* Buttons: full-width stacked on narrow screens, row when wide */}
              <Reveal delay={240}>
                <div className="flex flex-wrap justify-center min-[900px]:justify-start gap-4 mt-[clamp(1.5rem,3vw,2.5rem)]">
                  <CTAButton
                    label={primaryCta.label}
                    to={primaryCta.to}
                    withArrow
                    className="w-full sm:w-auto"
                  />
                  <CTAButton
                    label={heroContent.secondaryCta.label}
                    to={heroContent.secondaryCta.to}
                    variant="secondary"
                    className="w-full sm:w-auto"
                  />
                </div>
              </Reveal>

              <Reveal delay={320}>
                <div className="flex flex-wrap items-center justify-center min-[900px]:justify-start gap-x-5 gap-y-2 mt-[clamp(1.5rem,2.5vw,2rem)]">
                  {heroContent.trustPoints.map((point) => (
                    <span
                      key={point}
                      className="inline-flex items-center gap-1.5 text-[clamp(0.8125rem,0.78rem+0.2vw,0.875rem)] text-[#6B7280] dark:text-[#9CA3AF]"
                    >
                      <Icon.CheckCircle className="w-4 h-4 text-[#16A34A] flex-shrink-0" />
                      {point}
                    </span>
                  ))}
                </div>
              </Reveal>
            </div>

            {/* Interactive exam preview — grid item, vertically centered */}
            <ExamPreviewCard />
          </div>
        </Container>
      </div>
    </section>
  );
}
