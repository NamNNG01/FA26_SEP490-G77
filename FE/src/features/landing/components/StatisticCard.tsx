import React from 'react';
import { Card } from '@/components/ui/Card';
import { Reveal } from './Reveal';
import type { LandingStat } from '../data/landingData';

/**
 * StatisticCard
 *
 * One platform-metric card (icon + number + label) that fades in when it
 * enters the viewport. Purely presentational — data comes from
 * landingStats and is rendered with map() by the Statistics section.
 */
export function StatisticCard({ stat, index }: { stat: LandingStat; index: number }) {
  return (
    <Reveal delay={index * 100} className="h-full">
      <Card className="h-full p-6 flex flex-col items-center text-center gap-3 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
        <div
          className="w-14 h-14 rounded-[14px] flex items-center justify-center flex-shrink-0"
          style={{ background: `${stat.color}15`, color: stat.color }}
        >
          {stat.icon}
        </div>
        <p className="text-[30px] font-bold text-[#111827] leading-none tracking-tight">
          {stat.value}
        </p>
        <p className="text-[14px] font-medium text-[#6B7280]">{stat.label}</p>
      </Card>
    </Reveal>
  );
}
