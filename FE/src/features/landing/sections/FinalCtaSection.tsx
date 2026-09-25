import React from 'react';
import { Container } from '../components/Container';
import { CTAButton } from '../components/CTAButton';
import { Reveal } from '../components/Reveal';
import { finalCtaContent } from '../data/landingData';
import { ROUTES } from '@/app/routes';

/**
 * FinalCtaSection
 *
 * Closing call-to-action band: title, subtitle, "Create Account" (→
 * /register) and "View Pricing" (→ /pricing). Fluid clamp typography and
 * spacing; buttons wrap (full-width stacked on mobile, row when wide).
 */
export function FinalCtaSection() {
  return (
    <section className="bg-[#F9FAFB] dark:bg-[#0B1220]">
      <Container className="py-[clamp(3rem,6vw,5rem)]">
        <Reveal>
          <div className="relative overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] px-[clamp(1.25rem,4vw,2.5rem)] py-[clamp(2.5rem,6vw,3.5rem)] text-center shadow-xl shadow-[#2563EB]/20">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-white/10 blur-2xl"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-28 -left-20 w-72 h-72 rounded-full bg-white/10 blur-2xl"
            />

            <div className="relative max-w-[min(42rem,100%)] mx-auto">
              <h2 className="text-[clamp(1.625rem,1.3rem+1.8vw,2.125rem)] font-extrabold text-white tracking-tight leading-[1.15]">
                {finalCtaContent.title}
              </h2>
              <p className="text-[clamp(0.9rem,0.85rem+0.3vw,1rem)] text-blue-100 leading-relaxed mt-[clamp(0.75rem,1.5vw,1rem)]">
                {finalCtaContent.subtitle}
              </p>

              <div className="flex flex-wrap justify-center gap-[clamp(0.75rem,1.5vw,1rem)] mt-[clamp(1.5rem,3vw,2rem)]">
                <CTAButton
                  label="Create Account"
                  to={ROUTES.register}
                  variant="secondary"
                  className="w-full sm:w-auto !bg-white !text-[#2563EB] !border-transparent hover:!bg-blue-50"
                />
                <CTAButton
                  label={finalCtaContent.secondaryCta.label}
                  to={finalCtaContent.secondaryCta.to}
                  variant="secondary"
                  className="w-full sm:w-auto !bg-white/10 !text-white !border-white/30 hover:!bg-white/20"
                />
              </div>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
