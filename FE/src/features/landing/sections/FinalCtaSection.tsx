import React from 'react';
import { Container } from '../components/Container';
import { CTAButton } from '../components/CTAButton';
import { Reveal } from '@/components/common/Reveal';
import { finalCtaContent } from '../data/landingData';

/**
 * FinalCtaSection
 *
 * Closing call-to-action band: a solid deep-jade panel, copy on the left and
 * the two actions on the right (stacked on narrow screens). No gradient or
 * blurred glow — the contrast of the dark panel carries it.
 */
export function FinalCtaSection() {
  return (
    <section className="bg-surface-alt">
      <Container className="pb-[clamp(3rem,6vw,5rem)]">
        <Reveal>
          <div className="flex flex-col gap-6 rounded-[16px] bg-brand-900 px-[clamp(1.5rem,4vw,3rem)] py-[clamp(2rem,4.5vw,3rem)] md:flex-row md:items-center md:justify-between dark:bg-brand-950 dark:ring-1 dark:ring-brand-900">
            <div className="max-w-[min(36rem,100%)]">
              <h2 className="text-[clamp(1.5rem,1.2rem+1.4vw,2rem)] leading-[1.15] font-bold text-white">
                {finalCtaContent.title}
              </h2>
              <p className="mt-3 text-[clamp(0.9rem,0.85rem+0.25vw,1rem)] leading-relaxed text-brand-200">
                {finalCtaContent.subtitle}
              </p>
            </div>

            <div className="flex flex-shrink-0 flex-wrap gap-3">
              <CTAButton
                label={finalCtaContent.primaryCta.label}
                to={finalCtaContent.primaryCta.to}
                variant="secondary"
                className="w-full sm:w-auto !border-transparent !bg-white !text-brand-900 hover:!bg-brand-50"
              />
              <CTAButton
                label={finalCtaContent.secondaryCta.label}
                to={finalCtaContent.secondaryCta.to}
                variant="secondary"
                className="w-full sm:w-auto !border-white/30 !bg-transparent !text-white !shadow-none hover:!bg-white/10"
              />
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
