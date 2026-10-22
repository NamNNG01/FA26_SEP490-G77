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
    <section className="bg-surface-alt">
      <Container className="py-[clamp(3.5rem,7vw,6rem)]">
        <Reveal className="max-w-[min(40rem,100%)]">
          <p className="text-xs font-semibold tracking-[0.08em] text-brand-ink uppercase">
            {howItWorksContent.eyebrow}
          </p>
          <h2 className="mt-3 text-[clamp(1.75rem,1.2rem+2vw,2.5rem)] leading-[1.1] font-bold text-content">
            {howItWorksContent.title}
          </h2>
          <p className="mt-3 text-[clamp(0.95rem,0.9rem+0.25vw,1.0625rem)] text-content-muted">
            {howItWorksContent.subtitle}
          </p>
        </Reveal>

        <ol className="mt-[clamp(2.5rem,5vw,4rem)] flex flex-col gap-[clamp(2.5rem,5vw,4.5rem)]">
          {howItWorksSteps.map((step, i) => (
            <li key={step.step}>
              <Reveal className="grid items-center gap-[clamp(1.5rem,4vw,4rem)] md:grid-cols-2">
                <div className={i % 2 === 1 ? 'md:order-2' : ''}>
                  <span className="font-mono text-sm font-medium text-brand-ink">{step.step}</span>
                  <h3 className="mt-2 text-[clamp(1.25rem,1.05rem+0.8vw,1.625rem)] leading-snug font-semibold text-content">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-[30rem] text-lg leading-relaxed text-content-muted">
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

        <Reveal className="mt-[clamp(3rem,6vw,4.5rem)] border-t border-line pt-6">
          <p className="text-base text-content-muted">
            <span className="font-semibold text-content">Also in every course: </span>
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
      className="rounded-[14px] border border-line bg-surface p-5"
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
        <p className="text-xs font-semibold tracking-[0.06em] text-content-soft uppercase">Topic progress</p>
        <ul className="mt-4 flex flex-col gap-3.5">
          {topics.map((t) => (
            <li key={t.name}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-content">{t.name}</span>
                <span className="font-mono text-xs text-content-soft">{t.pct}%</span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-surface-muted">
                <div className="h-full rounded-full bg-brand-600" style={{ width: `${t.pct}%` }} />
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
          <p className="text-xs font-semibold tracking-[0.06em] text-content-soft uppercase">Mock exam 3</p>
          <span className="inline-flex items-center gap-1.5 font-mono text-lg font-semibold text-content">
            <Icon.Clock className="h-4 w-4 text-content-soft" />
            54:44
          </span>
        </div>
        <div className="mt-4 grid grid-cols-10 gap-1.5">
          {cells.map((state, idx) => (
            <span
              key={idx}
              className={`flex aspect-square items-center justify-center rounded-[6px] font-mono text-2xs ${
                state === 3
                  ? 'bg-brand-600 text-white'
                  : state === 2
                    ? 'border border-highlight text-warning-strong'
                    : state === 1
                      ? 'bg-brand-100 text-brand-ink-strong dark:bg-brand-900'
                      : 'border border-line text-content-subtle'
              }`}
            >
              {idx + 1}
            </span>
          ))}
        </div>
        <div className="mt-4 flex gap-4 text-xs text-content-soft">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-brand-100 dark:bg-brand-900" />Answered</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] border border-highlight" />Flagged</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] border border-line-strong" />Not yet</span>
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
          <p className="text-xs font-semibold tracking-[0.06em] text-content-soft uppercase">Attempt result</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-2xl leading-none font-bold text-content">
            72%
          </p>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-line-soft border-y border-line-soft">
        {weak.map((w) => (
          <li key={w.name} className="flex items-center justify-between py-2 text-sm">
            <span className="text-content">{w.name}</span>
            <span className="font-mono text-xs text-danger">{w.score}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm leading-relaxed text-content-muted">
        <span className="font-semibold text-brand-ink">AI review: </span>
        Most misses mix up Savings Plans and Reserved Instances. Revisit the pricing-model lesson, then retry the 11 cost questions.
      </p>
    </Panel>
  );
}
