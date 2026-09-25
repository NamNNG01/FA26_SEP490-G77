import React from 'react';
import { Container } from '../components/Container';
import { Reveal } from '../components/Reveal';
import { StatisticCard } from '../components/StatisticCard';
import { landingStats, statsSectionContent } from '../data/landingData';

/**
 * StatisticsSection
 *
 * Four platform-metric cards rendered from landingStats with map().
 *
 * Fluid grid — auto-fit minmax(280px,1fr): 1 column on mobile, 2 on
 * tablet/laptop, 4 on wide desktop — adapts to any viewport width and
 * zoom level without breakpoint-specific CSS. Spacing is fluid (clamp).
 */
export function StatisticsSection() {
  return (
    <section className="bg-white dark:bg-[#111827] border-y border-[#F3F4F6] dark:border-[#1F2937]">
      <Container className="py-[clamp(3rem,6vw,5rem)]">
        <Reveal className="text-center max-w-[min(42rem,100%)] mx-auto">
          <h2 className="text-[clamp(1.5rem,1.1rem+1.6vw,1.875rem)] font-bold text-[#111827] dark:text-[#F9FAFB] tracking-tight">
            {statsSectionContent.title}
          </h2>
          <p className="text-[clamp(0.9rem,0.85rem+0.25vw,1rem)] text-[#6B7280] dark:text-[#D1D5DB] mt-[clamp(0.5rem,1vw,0.75rem)]">
            {statsSectionContent.subtitle}
          </p>
        </Reveal>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-[clamp(1rem,2vw,1.25rem)] mt-[clamp(2rem,4vw,2.5rem)]">
          {landingStats.map((stat, i) => (
            <StatisticCard key={stat.label} stat={stat} index={i} />
          ))}
        </div>
      </Container>
    </section>
  );
}
