import React from 'react';
import { Icon } from '@/assets/icons';
import { Container } from '../components/Container';
import { Reveal } from '@/components/common/Reveal';
import {
  alsoIncluded,
  howItWorksContent,
  howItWorksSteps,
  type HowItWorksVisual,
} from '../data/landingData';

/**
 * HowItWorksSection
 *
 * Replaces the old six-card "Platform Benefits" grid. Three numbered steps,
 * each a text column beside a small, monochrome product visual (built from
 * plain elements, not screenshots), alternating sides on wide screens. The
 * minor capabilities are a single quiet line underneath instead of cards.
 *
 * One brand hue throughout — no per-card rainbow icon tiles.
 */
export function HowItWorksSection() {
  return (
    <section className="bg-[#F9FAFB] dark:bg-[#0B1220]">
      <Container className="py-[clamp(3.5rem,7vw,6rem)]">
        <Reveal className="max-w-[min(40rem,100%)]">
          <p className="text-[12.5px] font-semibold tracking-[0.08em] text-[#0D7C6C] uppercase dark:text-[#6FCBB6]">
            {howItWorksContent.eyebrow}
          </p>
          <h2 className="mt-3 text-[clamp(1.75rem,1.2rem+2vw,2.5rem)] leading-[1.1] font-bold text-[#111827] dark:text-[#F9FAFB]">
            {howItWorksContent.title}
          </h2>
          <p className="mt-3 text-[clamp(0.95rem,0.9rem+0.25vw,1.0625rem)] text-[#4B5563] dark:text-[#D1D5DB]">
            {howItWorksContent.subtitle}
          </p>
        </Reveal>

        <ol className="mt-[clamp(2.5rem,5vw,4rem)] flex flex-col gap-[clamp(2.5rem,5vw,4.5rem)]">
          {howItWorksSteps.map((step, i) => (
            <li key={step.step}>
              <Reveal className="grid items-center gap-[clamp(1.5rem,4vw,4rem)] md:grid-cols-2">
                <div className={i % 2 === 1 ? 'md:order-2' : ''}>
                  <span className="font-mono text-[13px] font-medium text-[#0D7C6C] dark:text-[#6FCBB6]">{step.step}</span>
                  <h3 className="mt-2 text-[clamp(1.25rem,1.05rem+0.8vw,1.625rem)] leading-snug font-semibold text-[#111827] dark:text-[#F9FAFB]">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-[30rem] text-[15px] leading-relaxed text-[#4B5563] dark:text-[#D1D5DB]">
                    {step.description}
                  </p>
                </div>
                <div className={i % 2 === 1 ? 'md:order-1' : ''}>
                  <StepVisual kind={step.visual} />
                </div>
              </Reveal>
            </li>
          ))}
        </ol>

        <Reveal className="mt-[clamp(3rem,6vw,4.5rem)] border-t border-[#E5E7EB] pt-6 dark:border-[#1F2937]">
          <p className="text-[14px] text-[#4B5563] dark:text-[#D1D5DB]">
            <span className="font-semibold text-[#111827] dark:text-[#F9FAFB]">Also in every course: </span>
            {alsoIncluded.join(' · ')}
          </p>
        </Reveal>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Visuals — deliberately schematic: they illustrate the step, they are not
// pretending to be live data.
// ---------------------------------------------------------------------------

function Panel({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="rounded-[14px] border border-[#E5E7EB] bg-white p-5 dark:border-[#1F2937] dark:bg-[#111827]"
    >
      {children}
    </div>
  );
}

function StepVisual({ kind }: { kind: HowItWorksVisual }) {
  if (kind === 'topics') {
    const topics = [
      { name: 'Cloud Fundamentals', pct: 86 },
      { name: 'Security & Compliance', pct: 64 },
      { name: 'Compute & Storage', pct: 52 },
      { name: 'Cost Management', pct: 31 },
    ];
    return (
      <Panel label="Topic progress: four exam domains with their completion">
        <p className="text-[12px] font-semibold tracking-[0.06em] text-[#6B7280] uppercase dark:text-[#9CA3AF]">Topic progress</p>
        <ul className="mt-4 flex flex-col gap-3.5">
          {topics.map((t) => (
            <li key={t.name}>
              <div className="flex items-baseline justify-between text-[13.5px]">
                <span className="text-[#111827] dark:text-[#F9FAFB]">{t.name}</span>
                <span className="font-mono text-[12.5px] text-[#6B7280] dark:text-[#9CA3AF]">{t.pct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-[#F3F4F6] dark:bg-[#1F2937]">
                <div className="h-full rounded-full bg-[#0D7C6C] dark:bg-[#6FCBB6]" style={{ width: `${t.pct}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    );
  }

  if (kind === 'mock') {
    // 0 = unanswered, 1 = answered, 2 = flagged, 3 = current
    const cells = [1, 1, 1, 2, 1, 1, 1, 1, 3, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0];
    return (
      <Panel label="Mock exam in progress: timer and question navigator">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold tracking-[0.06em] text-[#6B7280] uppercase dark:text-[#9CA3AF]">Mock exam 3</p>
          <span className="inline-flex items-center gap-1.5 font-mono text-[15px] font-semibold text-[#111827] dark:text-[#F9FAFB]">
            <Icon.Clock className="h-4 w-4 text-[#6B7280]" />
            54:44
          </span>
        </div>
        <div className="mt-4 grid grid-cols-10 gap-1.5">
          {cells.map((state, idx) => (
            <span
              key={idx}
              className={`flex aspect-square items-center justify-center rounded-[6px] font-mono text-[11px] ${
                state === 3
                  ? 'bg-[#0D7C6C] text-white'
                  : state === 2
                    ? 'border border-[#F2A93B] text-[#92400E] dark:text-[#FBBF24]'
                    : state === 1
                      ? 'bg-[#D3EEE7] text-[#0B5047] dark:bg-[#0F3B35] dark:text-[#6FCBB6]'
                      : 'border border-[#E5E7EB] text-[#9CA3AF] dark:border-[#1F2937]'
              }`}
            >
              {idx + 1}
            </span>
          ))}
        </div>
        <div className="mt-4 flex gap-4 text-[12px] text-[#6B7280] dark:text-[#9CA3AF]">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-[#D3EEE7] dark:bg-[#0F3B35]" />Answered</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] border border-[#F2A93B]" />Flagged</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] border border-[#D1D5DB]" />Not yet</span>
        </div>
      </Panel>
    );
  }

  const weak = [
    { name: 'Cost Management', score: '4 / 11' },
    { name: 'Support Plans', score: '3 / 7' },
  ];
  return (
    <Panel label="Attempt review: overall score, weakest topics and an AI study note">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[12px] font-semibold tracking-[0.06em] text-[#6B7280] uppercase dark:text-[#9CA3AF]">Attempt result</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-[32px] leading-none font-bold text-[#111827] dark:text-[#F9FAFB]">
            72%
          </p>
        </div>
        <span className="text-[12.5px] text-[#6B7280] dark:text-[#9CA3AF]">Pass mark 70%</span>
      </div>
      <ul className="mt-4 divide-y divide-[#F3F4F6] border-y border-[#F3F4F6] dark:divide-[#1F2937] dark:border-[#1F2937]">
        {weak.map((w) => (
          <li key={w.name} className="flex items-center justify-between py-2 text-[13.5px]">
            <span className="text-[#111827] dark:text-[#F9FAFB]">{w.name}</span>
            <span className="font-mono text-[12.5px] text-[#DC2626]">{w.score}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[13px] leading-relaxed text-[#4B5563] dark:text-[#D1D5DB]">
        <span className="font-semibold text-[#0D7C6C] dark:text-[#6FCBB6]">AI review: </span>
        Most misses mix up Savings Plans and Reserved Instances. Revisit the pricing-model lesson, then retry the 11 cost questions.
      </p>
    </Panel>
  );
}
