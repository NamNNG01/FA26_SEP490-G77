import React from 'react';
import { Card } from '@/components/ui/Card';
import { Reveal } from './Reveal';
import type { LandingFeature } from '../data/landingData';

/**
 * FeatureCard
 *
 * One platform-capability card (icon + title + description). Rendered from
 * the landingFeatures array with map(); purely presentational.
 */
export function FeatureCard({ feature, index }: { feature: LandingFeature; index: number }) {
  return (
    <Reveal delay={(index % 3) * 100} className="h-full">
      <Card className="h-full p-6 flex flex-col gap-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-[#BFDBFE] group">
        <div
          className="w-12 h-12 rounded-[12px] flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
          style={{ background: `${feature.color}15`, color: feature.color }}
        >
          {feature.icon}
        </div>
        <div>
          <h3 className="text-[16px] font-semibold text-[#111827] leading-snug">
            {feature.title}
          </h3>
          <p className="text-[14px] text-[#6B7280] mt-2 leading-relaxed">
            {feature.description}
          </p>
        </div>
      </Card>
    </Reveal>
  );
}
